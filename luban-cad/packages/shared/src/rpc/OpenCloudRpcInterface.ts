/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 */

import { RpcInterface, RpcManager } from '@itwin/core-common';
import type {
  BriefcaseInfo,
  ChangesetComparisonResult,
  ChangesetInfo,
  ConflictDetectionResult,
  DetectConflictsRequest,
  ResolveConflictsRequest,
  ResolveConflictsResult,
} from '../projects/types.js';

/**
 * LubanCAD RPC Interface
 *
 * This interface defines RPC methods that require backend access to:
 * - IModelHost / BriefcaseDb
 * - Local filesystem
 * - Editor commands
 *
 * Note: User/Project management uses iModelHub Services REST API directly
 */
export abstract class OpenCloudRpcInterface extends RpcInterface {
  /** The immutable name of the interface */
  public static readonly interfaceName = 'OpenCloudRpcInterface';

  /** The version of the interface */
  public static interfaceVersion = '1.0.0';

  /** The types that can be marshaled by the interface */
  public static types = () => [];

  /** Get the client instance */
  public static getClient(): OpenCloudRpcInterface {
    return RpcManager.getClientForInterface(OpenCloudRpcInterface);
  }

  // =============================================================================
  // iModel Briefcase Operations (Require IModelHost on backend)
  // =============================================================================

  /**
   * Acquire a briefcase for an iModel
   * This operation requires BriefcaseDb access on the backend
   */
  public async acquireBriefcase(_iModelId: string): Promise<BriefcaseInfo> {
    return this.forward(arguments);
  }

  /**
   * Release a briefcase
   */
  public async releaseBriefcase(_iModelId: string, _briefcaseId: number): Promise<void> {
    return this.forward(arguments);
  }

  /**
   * Pull changesets for a briefcase
   */
  public async pullChangesets(_iModelId: string, _briefcaseId: number): Promise<ChangesetInfo[]> {
    return this.forward(arguments);
  }

  /**
   * Push changes to an iModel
   */
  public async pushChanges(
    _iModelId: string,
    _briefcaseId: number,
    _description: string
  ): Promise<ChangesetInfo> {
    return this.forward(arguments);
  }

  /**
   * Compare two changesets and return differences
   */
  public async compareChangesets(
    _iModelId: string,
    _sourceChangesetId: string,
    _targetChangesetId: string
  ): Promise<ChangesetComparisonResult> {
    return this.forward(arguments);
  }

  // =============================================================================
  // Saved Views / Camera Paths (File operations on backend)
  // =============================================================================

  /**
   * Read external saved views from file
   * Reference: display-test-app implementation
   */
  public async readExternalSavedViews(_bimFileName: string): Promise<string> {
    return this.forward(arguments);
  }

  /**
   * Write external saved views to file
   */
  public async writeExternalSavedViews(_bimFileName: string, _namedViews: string): Promise<void> {
    return this.forward(arguments);
  }

  /**
   * Read external camera paths from file
   */
  public async readExternalCameraPaths(_bimFileName: string): Promise<string> {
    return this.forward(arguments);
  }

  /**
   * Write external camera paths to file
   */
  public async writeExternalCameraPaths(_bimFileName: string, _cameraPaths: string): Promise<void> {
    return this.forward(arguments);
  }

  // =============================================================================
  // File Operations (Backend filesystem access)
  // =============================================================================

  /**
   * Read external text file
   */
  public async readExternalFile(_fileName: string): Promise<string> {
    return this.forward(arguments);
  }

  /**
   * Write external text file
   */
  public async writeExternalFile(_fileName: string, _content: string): Promise<void> {
    return this.forward(arguments);
  }

  /**
   * Export iModel to GLTF format
   * Returns file content as bytes
   */
  public async exportIModel(_iModelId: string, _format: 'GLTF'): Promise<Uint8Array> {
    return this.forward(arguments);
  }

  // =============================================================================
  // Configuration & Lifecycle
  // =============================================================================

  /**
   * Get application configuration from backend
   */
  public async getConfiguration(): Promise<Record<string, string | number | boolean>> {
    return this.forward(arguments);
  }

  /**
   * Get access token (backend retrieves from its authorization client)
   */
  public async getAccessToken(): Promise<string> {
    return this.forward(arguments);
  }

  /**
   * Terminate backend (for graceful shutdown)
   */
  public async terminate(): Promise<void> {
    return this.forward(arguments);
  }

  // =============================================================================
  // Editor Commands (Future: Sprint 2+)
  // =============================================================================

  /**
   * Start an edit command on the backend
   * This integrates with @itwin/editor-backend EditCommandAdmin
   */
  public async startEditCommand(
    _commandId: string,
    _iModelKey: string,
    ..._args: unknown[]
  ): Promise<unknown> {
    return this.forward(arguments);
  }

  /**
   * Call a method on the active edit command
   */
  public async callEditMethod(_methodName: string, ..._args: unknown[]): Promise<unknown> {
    return this.forward(arguments);
  }

  /**
   * Finish the current edit command
   */
  public async finishEditCommand(): Promise<string> {
    return this.forward(arguments);
  }

  // =============================================================================
  // Conflict Detection & Resolution (Sprint 2+ - v1.1)
  // =============================================================================

  /**
   * Detect conflicts before pulling changesets.
   * Checks for conflicts between local pending changes and remote changesets.
   */
  public async detectConflicts(_request: DetectConflictsRequest): Promise<ConflictDetectionResult> {
    return this.forward(arguments);
  }

  /**
   * Resolve conflicts after detection.
   * Applies the specified resolutions to conflicts and prepares for pull.
   */
  public async resolveConflicts(_request: ResolveConflictsRequest): Promise<ResolveConflictsResult> {
    return this.forward(arguments);
  }

  /**
   * Check if there are local pending changes that haven't been pushed.
   */
  public async hasLocalChanges(_iModelId: string, _briefcaseId: number): Promise<boolean> {
    return this.forward(arguments);
  }
}
