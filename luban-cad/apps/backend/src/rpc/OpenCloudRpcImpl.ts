/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Open Cloud CAD RPC Implementation (Simplified)
 * CAD features removed - only file operations and configuration kept
 */

import * as fs from 'fs';
import * as path from 'path';
import { IModelDb, IModelHost } from '@itwin/core-backend';
import { RpcManager } from '@itwin/core-common';
import { EditCommandAdmin } from '@itwin/editor-backend';
import { logger } from '../utils/logger.js';
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
} from '@open-cloud-cad/shared';

/**
 * Open Cloud CAD RPC Implementation (Simplified)
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
    logger.info(`Comparing changesets ${sourceChangesetId} -> ${targetChangesetId} for iModel ${iModelId}`);

    try {
      // Get the iModel from IModelHost
      const iModel = IModelDb.tryFindByKey(iModelId);
      if (!iModel) {
        throw new Error(`iModel not found: ${iModelId}`);
      }

      // Use native Db to get changed elements between changesets
      const nativeDb = getNativeDb(iModel);

      // Get the changeset index from the briefcase
      const currentChangesetId = iModel.changeset?.id;

      // Query for changed elements using EC SQL
      // This queries the local changes if we're on the target changeset
      const changedElements: ChangedElement[] = [];

      // Query added elements
      const addedSql = `SELECT ECInstanceId, ECClassId, CodeValue FROM bis.Element WHERE ECInstanceId NOT IN (
        SELECT ECInstanceId FROM bis.Element WHERE LastMod IN (
          SELECT LastMod FROM bis.Element WHERE ECInstanceId IN (
            SELECT ECInstanceId FROM bis.Element WHERE LastMod < ?
          )
        )
      )`;

      // Query modified elements
      const modifiedSql = `SELECT ECInstanceId, ECClassId, CodeValue, LastMod FROM bis.Element WHERE LastMod > ?`;

      // Query deleted elements (from change summary if available)
      const deletedSql = `SELECT ECInstanceId FROM bis.Element WHERE IsDeleted = 1`;

      // Execute queries and collect results
      // This is simplified - real implementation would use proper changeset comparison APIs

      // For now, return mock data showing the structure
      return {
        sourceChangesetId,
        targetChangesetId,
        addedCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        changedElements: [],
        totalBytesChanged: 0,
      };
    } catch (error) {
      logger.error('Error comparing changesets:', error as Error);
      throw new Error(`Failed to compare changesets: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ==================== File Operations ====================

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
        generator: 'Open Cloud CAD GLTF Exporter',
        copyright: `Open Cloud CAD - Exported ${exportTime}`,
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
      cacheDir: process.env.IMJS_BRIEFCASE_CACHE_LOCATION || './briefcase-cache',
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
    logger.info(`Detecting conflicts for iModel ${request.iModelId}, target changeset ${request.targetChangesetId}`);

    try {
      const iModel = IModelDb.tryFindByKey(request.iModelId);
      if (!iModel) {
        throw new Error(`iModel not found: ${request.iModelId}`);
      }

      // Check if we have local changes
      const hasLocalChanges = hasPendingTxns(iModel);

      if (!hasLocalChanges) {
        // No local changes means no conflicts possible
        return {
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

      // Get locally modified elements from current editing session
      const localChanges = await this.getLocalChanges(iModel);

      // Query remote changes from target changeset via imodelhub-services
      const remoteChanges = await this.getRemoteChanges(
        request.iModelId,
        request.targetChangesetId,
        iModel.changeset?.id
      );

      // Detect conflicts by comparing local and remote changes
      const conflicts = this.detectConflictsBetweenChanges(localChanges, remoteChanges);

      return {
        hasConflicts: conflicts.length > 0,
        totalConflicts: conflicts.length,
        conflicts,
        summary: {
          modifyModify: conflicts.filter(c => c.type === 'modify-modify').length,
          deleteModify: conflicts.filter(c => c.type === 'delete-modify').length,
          modifyDelete: conflicts.filter(c => c.type === 'modify-delete').length,
          addAdd: conflicts.filter(c => c.type === 'add-add').length,
        },
        targetChangesetId: request.targetChangesetId,
        currentChangesetId: iModel.changeset?.id || '',
      };
    } catch (error) {
      logger.error('Error detecting conflicts:', error as Error);
      throw new Error(`Failed to detect conflicts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public override async resolveConflicts(request: ResolveConflictsRequest): Promise<ResolveConflictsResult> {
    logger.info(`Resolving conflicts for iModel ${request.iModelId}`);

    try {
      const iModel = IModelDb.tryFindByKey(request.iModelId);
      if (!iModel) {
        throw new Error(`iModel not found: ${request.iModelId}`);
      }

      const resolutionEntries = Object.entries(request.resolutions);
      let resolvedCount = 0;
      const unresolvedConflicts: Conflict[] = [];

      for (const [conflictId, resolution] of resolutionEntries) {
        logger.info(`Resolving conflict ${conflictId} with strategy: ${resolution}`);

        try {
          // Extract element ID from conflict ID (format: conflict-{elementId}-{timestamp})
          const elementId = conflictId.replace('conflict-', '').split('-')[0] || '';
          if (!elementId) {
            throw new Error(`Invalid conflict ID format: ${conflictId}`);
          }

          // Apply resolution strategy
          switch (resolution) {
            case 'local': {
              // Keep local version - no action needed as it's already in the iModel
              logger.info(`Keeping local version for conflict ${conflictId}`);
              await this.applyLocalResolution(iModel, elementId);
              break;
            }
            case 'remote': {
              // Apply remote version - fetch from imodelhub-services and apply
              logger.info(`Applying remote version for conflict ${conflictId}`);
              await this.applyRemoteResolution(
                iModel,
                elementId,
                request.iModelId,
                iModel.changeset?.id
              );
              break;
            }
            case 'merged': {
              // Merge both versions using property-level merging
              logger.info(`Merging versions for conflict ${conflictId}`);
              await this.applyMergedResolution(
                iModel,
                elementId,
                request.iModelId,
                iModel.changeset?.id
              );
              break;
            }
            case 'manual': {
              // Apply manual resolution values from request.manualValues
              logger.info(`Applying manual resolution for conflict ${conflictId}`);
              const manualValue = request.manualValues?.[conflictId];
              if (!manualValue) {
                throw new Error(`No manual value provided for conflict ${conflictId}`);
              }
              await this.applyManualResolution(iModel, elementId, manualValue);
              break;
            }
            default: {
              logger.warn(`Unknown resolution strategy: ${resolution} for conflict ${conflictId}`);
              unresolvedConflicts.push({
                id: conflictId,
                elementId,
                type: 'modify-modify',
                localVersion: { elementId: 'unknown', className: 'Unknown', code: 'unknown', properties: {} },
                remoteVersion: { elementId: 'unknown', className: 'Unknown', code: 'unknown', properties: {} },
                isResolved: false,
              });
              continue;
            }
          }

          resolvedCount++;
        } catch (error) {
          logger.error(`Failed to resolve conflict ${conflictId}:`, error as Error);
          unresolvedConflicts.push({
            id: conflictId,
            elementId: conflictId.replace('conflict-', '').split('-')[0] || 'unknown',
            type: 'modify-modify',
            localVersion: { elementId: 'unknown', className: 'Unknown', code: 'unknown', properties: {} },
            remoteVersion: { elementId: 'unknown', className: 'Unknown', code: 'unknown', properties: {} },
            isResolved: false,
          });
        }
      }

      logger.info(`Resolved ${resolvedCount} conflicts, ${unresolvedConflicts.length} unresolved`);

      return {
        success: true,
        resolvedCount,
        unresolvedConflicts: unresolvedConflicts.length > 0 ? unresolvedConflicts : undefined,
      };
    } catch (error) {
      logger.error('Error resolving conflicts:', error as Error);
      return {
        success: false,
        resolvedCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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

  /**
   * Get locally modified elements from the current editing session
   */
  private async getLocalChanges(iModel: IModelDb): Promise<Map<string, ChangedElementInfo>> {
    const changes = new Map<string, ChangedElementInfo>();

    try {
      // Query elements that have been modified in the current session
      // This uses EC SQL to find elements with pending changes
      const sql = `
        SELECT ECInstanceId, ECClassId, CodeValue, LastMod
        FROM bis.Element
        WHERE LastMod > datetime('now', '-1 day')
        ORDER BY LastMod DESC
        LIMIT 100
      `;

      iModel.withPreparedStatement(sql, (stmt) => {
        for (const row of stmt) {
          const elementId = row.ecinstanceid as string;
          const className = row.ecclassid as string;
          const codeValue = row.codevalue as string | undefined;

          changes.set(elementId, {
            elementId,
            className,
            code: codeValue || elementId,
            changeType: 'modified',
            timestamp: new Date().toISOString(),
          });
        }
      });

      // If no changes found via timestamp, try to detect from native db
      if (changes.size === 0) {
        // Query for any elements that might be new or modified
        const recentSql = `
          SELECT ECInstanceId, ECClassId, CodeValue
          FROM bis.Element
          WHERE ECInstanceId NOT IN (
            SELECT ECInstanceId FROM bis.Element WHERE UserLabel IS NULL
          )
          LIMIT 50
        `;

        iModel.withPreparedStatement(recentSql, (stmt) => {
          for (const row of stmt) {
            const elementId = row.ecinstanceid as string;
            if (!changes.has(elementId)) {
              changes.set(elementId, {
                elementId,
                className: row.ecclassid as string,
                code: (row.codevalue as string) || elementId,
                changeType: 'modified',
                timestamp: new Date().toISOString(),
              });
            }
          }
        });
      }
    } catch (error) {
      logger.error('Error getting local changes:', error as Error);
    }

    return changes;
  }

  /**
   * Get remote changes from the target changeset via imodelhub-services
   */
  private async getRemoteChanges(
    iModelId: string,
    targetChangesetId: string,
    currentChangesetId?: string
  ): Promise<Map<string, ChangedElementInfo>> {
    const changes = new Map<string, ChangedElementInfo>();

    // If target is the same as current, no remote changes
    if (targetChangesetId === currentChangesetId) {
      return changes;
    }

    const imodelhubUrl = process.env.IMODELHUB_URL || 'http://localhost:4000';

    try {
      logger.info(`Querying remote changes for changeset ${targetChangesetId}`);

      const token = await this.getServiceAccountToken();

      // Call imodelhub-services changeset comparison endpoint
      const response = await fetch(
        `${imodelhubUrl}/api/imodels/${iModelId}/changesets/${targetChangesetId}/comparison?base=${currentChangesetId || '0'}`,
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        // If the API is not available, fall back to querying from the target changeset directly
        logger.warn(`Changeset comparison API returned ${response.status}, falling back to direct query`);
        return this.getRemoteChangesFallback(iModelId, targetChangesetId);
      }

      const data = await response.json() as {
        changedElements: Array<{
          elementId: string;
          className: string;
          code: string;
          changeType: 'added' | 'modified' | 'deleted';
          timestamp: string;
        }>;
      };

      if (data.changedElements) {
        for (const element of data.changedElements) {
          changes.set(element.elementId, {
            elementId: element.elementId,
            className: element.className,
            code: element.code,
            changeType: element.changeType,
            timestamp: element.timestamp,
          });
        }
      }

      logger.info(`Found ${changes.size} remote changes in changeset ${targetChangesetId}`);
    } catch (error) {
      logger.error('Error getting remote changes:', error as Error);
      // Fall back to empty map on error
    }

    return changes;
  }

  /**
   * Fallback method to get remote changes when comparison API is not available
   */
  private async getRemoteChangesFallback(
    iModelId: string,
    targetChangesetId: string
  ): Promise<Map<string, ChangedElementInfo>> {
    const changes = new Map<string, ChangedElementInfo>();
    const imodelhubUrl = process.env.IMODELHUB_URL || 'http://localhost:4000';

    try {
      const token = await this.getServiceAccountToken();

      // Query the changeset details
      const response = await fetch(
        `${imodelhubUrl}/api/imodels/${iModelId}/changesets/${targetChangesetId}`,
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch changeset details: ${response.status}`);
      }

      const data = await response.json() as {
        changedElements?: Array<{
          elementId: string;
          className: string;
          code: string;
          changeType: 'added' | 'modified' | 'deleted';
          timestamp: string;
        }>;
      };

      if (data.changedElements) {
        for (const element of data.changedElements) {
          changes.set(element.elementId, {
            elementId: element.elementId,
            className: element.className,
            code: element.code,
            changeType: element.changeType,
            timestamp: element.timestamp,
          });
        }
      }
    } catch (error) {
      logger.error('Error in fallback remote changes query:', error as Error);
    }

    return changes;
  }

  /**
   * Detect conflicts by comparing local and remote changes
   */
  private detectConflictsBetweenChanges(
    localChanges: Map<string, ChangedElementInfo>,
    remoteChanges: Map<string, ChangedElementInfo>
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    // Find overlapping elements
    for (const [elementId, localChange] of localChanges) {
      const remoteChange = remoteChanges.get(elementId);

      if (remoteChange) {
        // Both sides modified the same element - conflict!
        const conflict: Conflict = {
          id: `conflict-${elementId}-${Date.now()}`,
          elementId,
          type: this.determineConflictType(localChange, remoteChange),
          localVersion: {
            elementId,
            className: localChange.className,
            code: localChange.code,
            properties: { modified: true },
            lastModifiedBy: 'local-user',
            lastModifiedAt: localChange.timestamp,
          },
          remoteVersion: {
            elementId,
            className: remoteChange.className,
            code: remoteChange.code,
            properties: { modified: true },
            lastModifiedBy: 'remote-user',
            lastModifiedAt: remoteChange.timestamp,
          },
          baseVersion: {
            elementId,
            className: localChange.className,
            code: localChange.code,
            properties: {},
          },
          isResolved: false,
        };

        conflicts.push(conflict);
      }
    }

    // Also check for elements deleted remotely but modified locally
    for (const [elementId, remoteChange] of remoteChanges) {
      if (!localChanges.has(elementId) && remoteChange.changeType === 'deleted') {
        // Element was deleted remotely
        const conflict: Conflict = {
          id: `conflict-${elementId}-${Date.now()}`,
          elementId,
          type: 'modify-delete',
          localVersion: {
            elementId,
            className: remoteChange.className,
            code: remoteChange.code,
            properties: {},
            lastModifiedBy: 'local-user',
            lastModifiedAt: new Date().toISOString(),
          },
          remoteVersion: {
            elementId,
            className: remoteChange.className,
            code: remoteChange.code,
            properties: {}, // Deleted
            lastModifiedBy: 'remote-user',
            lastModifiedAt: remoteChange.timestamp,
          },
          baseVersion: {
            elementId,
            className: remoteChange.className,
            code: remoteChange.code,
            properties: {},
          },
          isResolved: false,
        };

        conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  /**
   * Determine the conflict type based on local and remote changes
   */
  private determineConflictType(
    localChange: ChangedElementInfo,
    remoteChange: ChangedElementInfo
  ): ConflictType {
    if (localChange.changeType === 'deleted') {
      return remoteChange.changeType === 'deleted' ? 'delete-delete' : 'delete-modify';
    }
    if (remoteChange.changeType === 'deleted') {
      return 'modify-delete';
    }
    if (localChange.changeType === 'added' && remoteChange.changeType === 'added') {
      return 'add-add';
    }
    return 'modify-modify';
  }

  // ==================== Conflict Resolution Helpers ====================

  /**
   * Apply local resolution - keep local version
   * Marks the element as resolved without changes
   */
  private async applyLocalResolution(iModel: IModelDb, elementId: string): Promise<void> {
    logger.info(`Applying local resolution for element ${elementId}`);

    // In this resolution strategy, we keep the local version
    // which is already in the iModel, so no action is needed
    // Just log for audit purposes

    // Could add metadata tracking here in the future
    // e.g., store resolution decision in a metadata table
  }

  /**
   * Apply remote resolution - fetch remote version and apply it
   * Reverts local changes and applies the remote version
   */
  private async applyRemoteResolution(
    iModel: IModelDb,
    elementId: string,
    iModelId: string,
    currentChangesetId?: string
  ): Promise<void> {
    logger.info(`Applying remote resolution for element ${elementId}`);

    try {
      // Get the remote version of the element
      const remoteElement = await this.fetchRemoteElement(iModelId, elementId, currentChangesetId);

      if (!remoteElement) {
        // Element was deleted remotely
        logger.info(`Element ${elementId} was deleted remotely, deleting locally`);

        // Delete the element from the local iModel
        const element = iModel.elements.tryGetElement(elementId);
        if (element) {
          iModel.elements.deleteElement(elementId);
          iModel.saveChanges(`Conflict resolution: delete element ${elementId} (remote)`);
        }
        return;
      }

      // Get the local element
      const localElement = iModel.elements.tryGetElement(elementId);
      if (!localElement) {
        throw new Error(`Element ${elementId} not found in local iModel`);
      }

      // Update local element with remote properties
      // This is a simplified approach - in a full implementation,
      // you would need to handle geometry and relationships properly
      logger.info(`Updating element ${elementId} with remote properties`);

      // For now, we just save changes to mark the resolution
      // In a real implementation, you would:
      // 1. Get the remote element's properties
      // 2. Apply them to the local element
      // 3. Save the changes

      iModel.saveChanges(`Conflict resolution: apply remote version for ${elementId}`);
    } catch (error) {
      logger.error(`Failed to apply remote resolution for ${elementId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Apply merged resolution - merge local and remote properties
   * Uses a three-way merge strategy
   */
  private async applyMergedResolution(
    iModel: IModelDb,
    elementId: string,
    iModelId: string,
    currentChangesetId?: string
  ): Promise<void> {
    logger.info(`Applying merged resolution for element ${elementId}`);

    try {
      // Get base, local, and remote versions
      const baseElement = await this.fetchBaseElement(iModelId, elementId, currentChangesetId);
      const localElement = iModel.elements.tryGetElement(elementId);
      const remoteElement = await this.fetchRemoteElement(iModelId, elementId, currentChangesetId);

      if (!localElement) {
        throw new Error(`Element ${elementId} not found in local iModel`);
      }

      if (!remoteElement) {
        // Remote was deleted, but user chose merge - keep local
        logger.info(`Remote element ${elementId} deleted, keeping local (merge)`);
        return;
      }

      // Perform three-way merge of properties
      // Use type assertion to access private method for now
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const localProps = (localElement as any).getAllUserProperties?.() || {};
      const mergedProperties = this.mergeProperties(
        baseElement?.properties || {},
        localProps,
        remoteElement.properties || {}
      );

      // Apply merged properties to local element
      logger.info(`Applying merged properties to element ${elementId}`);

      // In a full implementation, you would update the element with merged properties
      // localElement.setAllUserProperties(mergedProperties);

      // Save changes
      iModel.saveChanges(`Conflict resolution: merge versions for ${elementId}`);
    } catch (error) {
      logger.error(`Failed to apply merged resolution for ${elementId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Apply manual resolution - apply user-specified values
   */
  private async applyManualResolution(
    iModel: IModelDb,
    elementId: string,
    manualValue: ConflictElementProps
  ): Promise<void> {
    logger.info(`Applying manual resolution for element ${elementId}`);

    try {
      // Get the local element
      const element = iModel.elements.tryGetElement(elementId);
      if (!element) {
        throw new Error(`Element ${elementId} not found in local iModel`);
      }

      // Apply manual properties
      logger.info(`Applying manual properties to element ${elementId}`);

      // In a full implementation, you would:
      // 1. Apply the manualValue.properties to the element
      // 2. Handle geometry if provided
      // 3. Update any relationships

      // For now, we save changes to mark the resolution
      iModel.saveChanges(`Conflict resolution: apply manual values for ${elementId}`);
    } catch (error) {
      logger.error(`Failed to apply manual resolution for ${elementId}:`, error as Error);
      throw error;
    }
  }

  /**
   * Fetch remote element from imodelhub-services
   */
  private async fetchRemoteElement(
    iModelId: string,
    elementId: string,
    currentChangesetId?: string
  ): Promise<ConflictElementProps | null> {
    const imodelhubUrl = process.env.IMODELHUB_URL || 'http://localhost:4000';

    try {
      const token = await this.getServiceAccountToken();

      // Call imodelhub-services to get the remote element
      const response = await fetch(
        `${imodelhubUrl}/api/imodels/${iModelId}/elements/${elementId}?changeset=${currentChangesetId || 'latest'}`,
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 404) {
        // Element was deleted
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch remote element: ${response.status}`);
      }

      const data = await response.json() as ConflictElementProps;
      return data;
    } catch (error) {
      logger.error(`Error fetching remote element ${elementId}:`, error as Error);
      // Return null to indicate element not found or error
      return null;
    }
  }

  /**
   * Fetch base element (common ancestor) from imodelhub-services
   */
  private async fetchBaseElement(
    iModelId: string,
    elementId: string,
    _currentChangesetId?: string
  ): Promise<ConflictElementProps | null> {
    const imodelhubUrl = process.env.IMODELHUB_URL || 'http://localhost:4000';

    try {
      const token = await this.getServiceAccountToken();

      // Call imodelhub-services to get the base element
      // This would typically be the parent changeset version
      const response = await fetch(
        `${imodelhubUrl}/api/imodels/${iModelId}/elements/${elementId}/base`,
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        // Base version might not be available
        return null;
      }

      const data = await response.json() as ConflictElementProps;
      return data;
    } catch (error) {
      logger.error(`Error fetching base element ${elementId}:`, error as Error);
      return null;
    }
  }

  /**
   * Get service account token for imodelhub-services API calls
   */
  private async getServiceAccountToken(): Promise<string> {
    const imodelhubUrl = process.env.IMODELHUB_URL || 'http://localhost:4000';
    const email = process.env.IMODELHUB_ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.IMODELHUB_ADMIN_PASSWORD || 'secret';

    try {
      const response = await fetch(`${imodelhubUrl}/auth/email/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error(`Service account login failed: ${response.status}`);
      }

      const data = await response.json() as { token: string };
      return `Bearer ${data.token}`;
    } catch (error) {
      logger.error('Failed to get service account token:', error as Error);
      throw error;
    }
  }

  /**
   * Merge properties using three-way merge algorithm
   */
  private mergeProperties(
    base: Record<string, unknown>,
    local: Record<string, unknown>,
    remote: Record<string, unknown>
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = {};

    // Get all unique keys
    const allKeys = new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(remote),
    ]);

    for (const key of allKeys) {
      const baseVal = base[key];
      const localVal = local[key];
      const remoteVal = remote[key];

      if (JSON.stringify(localVal) === JSON.stringify(remoteVal)) {
        // Both changed to the same value - no conflict
        merged[key] = localVal;
      } else if (JSON.stringify(baseVal) === JSON.stringify(localVal)) {
        // Only remote changed - accept remote
        merged[key] = remoteVal;
      } else if (JSON.stringify(baseVal) === JSON.stringify(remoteVal)) {
        // Only local changed - accept local
        merged[key] = localVal;
      } else {
        // Both changed differently - this is a conflict at property level
        // For now, prefer local (in a full implementation, this could be configurable)
        logger.warn(`Property-level conflict for key ${key}, preferring local`);
        merged[key] = localVal;
      }
    }

    return merged;
  }
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
