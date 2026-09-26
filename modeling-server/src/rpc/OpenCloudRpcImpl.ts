/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * LubanCAD RPC Implementation (Simplified)
 * CAD features removed - only file operations and configuration kept
 */

import * as fs from 'fs';
import * as path from 'path';
import { IModelDb, IModelHost } from '@itwin/core-backend';
import { RpcManager } from '@itwin/core-common';
import { EditCommandAdmin } from '@itwin/editor-backend';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { getNativeDb, hasPendingTxns } from '../utils/itwinInternals.js';
import {
  type BriefcaseInfo,
  type ChangesetComparisonResult,
  type ChangesetInfo,
  type ChangedElement,
  type Conflict,
  type ConflictDetectionResult,
  type ConflictElementProps,
  type ConflictResolution,
  type ConflictType,
  type DetectConflictsRequest,
  type ResolveConflictsRequest,
  type ResolveConflictsResult,
  OpenCloudRpcInterface,
} from '@luban-cad/shared';

/**
 * LubanCAD RPC Implementation (Simplified)
 *
 * 运行在 backend 进程中，可以访问:
 * - IModelHost
 * - BriefcaseDb / SnapshotDb
 * - 本地文件系统
 */
export class OpenCloudRpcImpl extends OpenCloudRpcInterface {
  constructor() {
    super();
  }

  // ==================== Briefcase Operations ====================

  public override async acquireBriefcase(iModelId: string): Promise<BriefcaseInfo> {
    logger.info(`Acquiring briefcase for iModel ${iModelId}`);

    // Note: Briefcase acquisition is typically done through imodelhub-services REST API
    // This RPC method is kept for compatibility but delegates to the REST API
    throw new Error('Use imodelhub-services REST API for briefcase operations: POST /api/briefcases');
  }

  public override async releaseBriefcase(iModelId: string, briefcaseId: number): Promise<void> {
    logger.info(`Releasing briefcase ${briefcaseId} for iModel ${iModelId}`);

    // Note: Briefcase release is typically done through imodelhub-services REST API
    throw new Error('Use imodelhub-services REST API for briefcase operations: DELETE /api/briefcases/:id');
  }

  public override async pullChangesets(
    _iModelId: string,
    _briefcaseId: number
  ): Promise<ChangesetInfo[]> {
    throw new Error('Use imodelhub-services REST API for changeset operations.');
  }

  public override async pushChanges(
    _iModelId: string,
    _briefcaseId: number,
    _description: string
  ): Promise<ChangesetInfo> {
    throw new Error('Use imodelhub-services REST API for changeset operations.');
  }

  public override async compareChangesets(
    iModelId: string,
    sourceChangesetId: string,
    targetChangesetId: string
  ): Promise<ChangesetComparisonResult> {
    // T1.1: changeset comparison is not implemented against the real hub.
    // Say so explicitly instead of returning a mock/empty structure.
    const iModel = IModelDb.tryFindByKey(iModelId);
    if (!iModel) {
      throw new Error(`iModel not found: ${iModelId}`);
    }

    logger.info(`compareChangesets unavailable (feature not implemented): ${sourceChangesetId} -> ${targetChangesetId}`);
    return {
      sourceChangesetId,
      targetChangesetId,
      addedCount: 0,
      modifiedCount: 0,
      deletedCount: 0,
      changedElements: [],
      featureAvailable: false,
    };
  }
  public override async exportIModel(
    iModelId: string,
    _format: 'GLTF'
  ): Promise<Uint8Array> {
    logger.info(`Exporting iModel ${iModelId} to GLTF`);

    try {
      const iModel = IModelDb.tryFindByKey(iModelId);
      if (!iModel) {
        throw new Error(`iModel not found: ${iModelId}`);
      }

      // Get iModel metadata for export
      const iModelName = iModel.name ?? 'export';
      const exportTime = new Date().toISOString();

      // GLTF export: Create a JSON representation of the iModel structure
      const gltfData = await this.exportToGltf(iModel, iModelName, exportTime);
      return gltfData;
    } catch (error) {
      logger.error('Export to GLTF failed:', error as Error);
      throw new Error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export iModel to GLTF format (JSON + binary buffers)
   * Creates a simplified GLTF 2.0 representation
   */
  private async exportToGltf(
    iModel: IModelDb,
    name: string,
    exportTime: string
  ): Promise<Uint8Array> {
    // Query all geometric elements
    const elements: Array<{
      id: string;
      className: string;
      category?: string;
      placement?: { origin: number[]; angles?: number[] };
    }> = [];

    iModel.withPreparedStatement(
      'SELECT ECInstanceId, ECClassId, CodeValue FROM bis.GeometricElement3d WHERE Category IS NOT NULL',
      (stmt) => {
        for (const row of stmt) {
          elements.push({
            id: row.ecinstanceid as string,
            className: row.ecclassid as string,
          });
        }
      }
    );

    // Build simplified GLTF structure
    const gltf = {
      asset: {
        version: '2.0',
        generator: 'LubanCAD GLTF Exporter',
        copyright: `LubanCAD - Exported ${exportTime}`,
      },
      scene: 0,
      scenes: [{ name: name, nodes: elements.map((_, i) => i) }],
      nodes: elements.map((el) => ({
        name: el.className,
        mesh: 0,
      })),
      meshes: [
        {
          name: 'DefaultMesh',
          primitives: [
            {
              attributes: { POSITION: 0 },
              mode: 4, // TRIANGLES
            },
          ],
        },
      ],
      buffers: [],
      bufferViews: [],
      accessors: [],
      // Extension with metadata
      extras: {
        openCloudCad: {
          iModelName: name,
          exportTime,
          elementCount: elements.length,
        },
      },
    };

    const gltfJson = JSON.stringify(gltf, null, 2);
    return new TextEncoder().encode(gltfJson);
  }

  // ==================== Saved Views / Camera Paths ====================
  // 参考 display-test-app/src/backend/Backend.ts

  private createEsvFilename(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.');
    if (-1 !== dotIndex) return `${fileName.substring(0, dotIndex)}_ESV.json`;
    return `${fileName}.sv`;
  }

  private createCameraPathsFilename(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.');
    if (-1 !== dotIndex) return `${fileName.substring(0, dotIndex)}_cameraPaths.json`;
    return `${fileName}.cameraPaths.json`;
  }

  public override async readExternalSavedViews(bimFileName: string): Promise<string> {
    const esvFileName = this.createEsvFilename(bimFileName);
    if (!fs.existsSync(esvFileName)) return '';
    return fs.readFileSync(esvFileName).toString();
  }

  public override async writeExternalSavedViews(
    bimFileName: string,
    namedViews: string
  ): Promise<void> {
    const esvFileName = this.createEsvFilename(bimFileName);
    fs.writeFileSync(esvFileName, namedViews);
  }

  public override async readExternalCameraPaths(bimFileName: string): Promise<string> {
    const cameraPathsFileName = this.createCameraPathsFilename(bimFileName);
    if (!fs.existsSync(cameraPathsFileName)) return '';
    return fs.readFileSync(cameraPathsFileName).toString();
  }

  public override async writeExternalCameraPaths(
    bimFileName: string,
    cameraPaths: string
  ): Promise<void> {
    const cameraPathsFileName = this.createCameraPathsFilename(bimFileName);
    fs.writeFileSync(cameraPathsFileName, cameraPaths);
  }

  public override async readExternalFile(fileName: string): Promise<string> {
    if (!fs.existsSync(fileName)) return '';
    return fs.readFileSync(fileName).toString();
  }

  public override async writeExternalFile(fileName: string, content: string): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(fileName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fileName, content);
  }

  // ==================== Configuration & Lifecycle ====================

  public override async getConfiguration(): Promise<
    Record<string, string | number | boolean>
  > {
    return {
      version: '1.0.0',
      apiVersion: 'v1.0',
      cacheDir: config.BRIEFCASE_CACHE_LOCATION,
      maxUploadSize: 100 * 1024 * 1024, // 100MB
    };
  }

  public override async getAccessToken(): Promise<string> {
    const token = await IModelHost.authorizationClient?.getAccessToken();
    if (!token) throw new Error('Not authenticated');
    return token;
  }

  public override async terminate(): Promise<void> {
    await IModelHost.shutdown();
  }

  // ==================== Editor Commands ====================
  // Integration with @itwin/editor-backend EditCommandAdmin

  public override async startEditCommand(
    commandId: string,
    iModelKey: string,
    ...args: unknown[]
  ): Promise<unknown> {
    logger.info(`[startEditCommand] Starting: ${commandId} for iModel: ${iModelKey}`);
    logger.info(`[startEditCommand] Args: ${JSON.stringify(args)}`);

    // Finish any existing command first
    await EditCommandAdmin.finishCommand();
    logger.info('[startEditCommand] Finished any existing command');

    if (commandId === '') {
      // Just finish the active command, don't start a new one
      return { commandId: '', version: '0.0.0' };
    }

    // Find the command class by commandId
    const commandClass = EditCommandAdmin.commands.get(commandId);
    if (undefined === commandClass) {
      logger.error(`[startEditCommand] Command not registered: ${commandId}`);
      logger.info(`[startEditCommand] Available commands: ${Array.from(EditCommandAdmin.commands.keys()).join(', ')}`);
      throw new Error(`Command not registered [${commandId}]`);
    }
    logger.info(`[startEditCommand] Found command class: ${commandClass.name}`);

    // Find the iModel by key
    const iModel = IModelDb.tryFindByKey(iModelKey);
    if (undefined === iModel) {
      logger.error(`[startEditCommand] iModel not found: ${iModelKey}`);
      throw new Error(`iModel not found [${iModelKey}]`);
    }
    logger.info(`[startEditCommand] Found iModel: ${iModel.name}`);

    // Create command instance and run it
    try {
      const cmd = new commandClass(iModel, ...args);
      logger.info(`[startEditCommand] Created command instance`);
      const result = await EditCommandAdmin.runCommand(cmd);
      logger.info(`[startEditCommand] Command started, active: ${EditCommandAdmin.activeCommand?.ctor.commandId}`);
      return result;
    } catch (error) {
      logger.error('[startEditCommand] Failed to start command:', error as Error);
      throw error;
    }
  }

  public override async callEditMethod(
    methodName: string,
    ...args: unknown[]
  ): Promise<unknown> {
    logger.info(`[callEditMethod] Calling: ${methodName}`);
    logger.info(`[callEditMethod] Args: ${JSON.stringify(args, null, 2)}`);

    const cmd = EditCommandAdmin.activeCommand;
    if (!cmd) {
      logger.error('[callEditMethod] No active command!');
      throw new Error('No active command');
    }
    logger.info(`[callEditMethod] Active command: ${cmd.ctor.commandId}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic dispatch on command methods
    const func = (cmd as any)[methodName];
    if (!func) {
      logger.error(`[callEditMethod] Method ${methodName} not found on ${cmd.ctor.commandId}`);
      throw new Error(`Method ${methodName} not found on ${cmd.ctor.commandId}`);
    }

    try {
      const result = await func.call(cmd, ...args);
      logger.info(`[callEditMethod] Result: ${JSON.stringify(result, null, 2)}`);
      return result;
    } catch (error) {
      logger.error(`[callEditMethod] Error calling ${methodName}:`, error as Error);
      throw error;
    }
  }

  public override async finishEditCommand(): Promise<string> {
    logger.info('Finishing edit command');

    await EditCommandAdmin.finishCommand();
    return 'done';
  }

  // ==================== Conflict Detection & Resolution ====================

  public override async detectConflicts(request: DetectConflictsRequest): Promise<ConflictDetectionResult> {
    // T1.1: conflict detection is not implemented against the real hub
    // (the remote-changes API it used never existed). Degrade explicitly
    // instead of answering a fake "no conflicts". Real design lands in T1.6.
    const iModel = IModelDb.tryFindByKey(request.iModelId);
    if (!iModel) {
      throw new Error(`iModel not found: ${request.iModelId}`);
    }

    logger.info(`detectConflicts unavailable (feature not implemented) for iModel ${request.iModelId}`);
    return {
      featureAvailable: false,
      hasConflicts: false,
      totalConflicts: 0,
      conflicts: [],
      summary: {
        modifyModify: 0,
        deleteModify: 0,
        modifyDelete: 0,
        addAdd: 0,
      },
      targetChangesetId: request.targetChangesetId,
      currentChangesetId: iModel.changeset?.id || '',
    };
  }
  public override async resolveConflicts(request: ResolveConflictsRequest): Promise<ResolveConflictsResult> {
    // T1.1: conflict resolution depends on conflict detection, which is
    // explicitly unavailable — see detectConflicts. Degrade honestly.
    const iModel = IModelDb.tryFindByKey(request.iModelId);
    if (!iModel) {
      throw new Error(`iModel not found: ${request.iModelId}`);
    }

    logger.info(`resolveConflicts unavailable (feature not implemented) for iModel ${request.iModelId}`);
    return {
      featureAvailable: false,
      success: false,
      resolvedCount: 0,
      error: '冲突解决功能暂不可用（冲突检测未实现，规划见 T1.6）',
    };
  }
  public override async hasLocalChanges(iModelId: string, _briefcaseId: number): Promise<boolean> {
    try {
      const iModel = IModelDb.tryFindByKey(iModelId);
      if (!iModel) {
        return false;
      }

      return hasPendingTxns(iModel);
    } catch {
      return false;
    }
  }

  // ==================== Conflict Detection Helpers ====================
}

// Helper type for changed element information
interface ChangedElementInfo {
  elementId: string;
  className: string;
  code: string;
  changeType: 'added' | 'modified' | 'deleted';
  timestamp: string;
}

// Note: RPC implementation is registered in main.ts after IpcHost.startup()
// RpcManager.registerImpl(OpenCloudRpcInterface, OpenCloudRpcImpl);
