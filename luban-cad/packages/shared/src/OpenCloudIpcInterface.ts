/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Custom IPC interface for LubanCAD briefcase operations.
 *
 * IpcApp.appFunctionIpc already handles openBriefcase/saveChanges/pushChanges/pullChanges.
 * This interface adds only the initial download step that NativeApp would normally handle.
 */

import type { Changeset } from './projects/types.js';

/** IPC channel name for LubanCAD custom operations */
export const openCloudIpcChannel = "open-cloud-ipc";

/** Result returned after briefcase is located/downloaded on the backend */
export interface BriefcaseDownloadResult {
  /** Absolute path to the .bim file on the backend's disk */
  fileName: string;
  /** The briefcase ID assigned by iModelHub */
  briefcaseId: number;
  /** The changeset this briefcase is currently at */
  changeset: Pick<Changeset, 'id' | 'index'>;
}

/** A single feature entry in the CAD feature history */
export interface CadFeatureRecord {
  /** Element ID of the CadFeature record in the iModel */
  id: string;
  /** Feature type key, e.g. "Extrude", "Revolve", "Boolean.Unite" */
  featureType: string;
  /** JSON-serialized feature parameters */
  params: string;
  /** Display order */
  order: number;
  /** Whether this feature is suppressed (temporarily disabled) */
  suppressed?: boolean;
}

/** Custom IPC interface for LubanCAD backend operations */
export interface OpenCloudIpcInterface {
  /**
   * Locate a cached briefcase or download a new one from iModelHub.
   *
   * Does NOT open the BriefcaseDb — the caller must follow up with
   * BriefcaseConnection.openFile({ fileName }) which triggers openBriefcase IPC.
   */
  downloadBriefcase(iTwinId: string, iModelId: string, readonly?: boolean): Promise<BriefcaseDownloadResult>;

  /**
   * Ensure the OpenCloudCAD EC schema is imported into the briefcase iModel.
   * Idempotent — safe to call multiple times.
   * @param fileName Absolute path to the .bim file
   */
  ensureCadSchema(fileName: string): Promise<void>;

  /**
   * Insert a CadFeature record into the iModel.
   * @param fileName Absolute path to the .bim file
   * @param featureType Feature type key, e.g. "Extrude"
   * @param params JSON-serialized parameters
   * @returns The new CadFeature element ID
   */
  createFeature(fileName: string, featureType: string, params: string): Promise<string>;

  /**
   * List all CadFeature records in the iModel.
   * @param fileName Absolute path to the .bim file
   */
  listFeatures(fileName: string): Promise<CadFeatureRecord[]>;

  /**
   * Delete a CadFeature record from the iModel.
   * @param fileName Absolute path to the .bim file
   * @param featureId Element ID of the CadFeature to delete
   */
  deleteFeature(fileName: string, featureId: string): Promise<void>;

  /**
   * Update a CadFeature record in the iModel.
   * @param fileName Absolute path to the .bim file
   * @param featureId Element ID of the CadFeature to update
   * @param updates Object containing fields to update (featureType, params)
   */
  updateFeature(fileName: string, featureId: string, updates: { featureType?: string; params?: string }): Promise<void>;

  /**
   * Suppress or unsuppress a CadFeature record.
   * @param fileName Absolute path to the .bim file
   * @param featureId Element ID of the CadFeature
   * @param suppressed Whether the feature should be suppressed
   */
  setFeatureSuppressed(fileName: string, featureId: string, suppressed: boolean): Promise<void>;

  /**
   * Reorder a CadFeature by moving it to a new position.
   * @param fileName Absolute path to the .bim file
   * @param featureId Element ID of the CadFeature to move
   * @param newOrder The new order index (0-based)
   */
  reorderFeature(fileName: string, featureId: string, newOrder: number): Promise<void>;

  /**
   * Create a new PhysicalPartition + PhysicalModel (assembly) under the root Subject.
   * @param fileName Absolute path to the .bim file
   * @param assemblyName Name for the new assembly
   * @returns The model ID of the new PhysicalModel
   */
  createAssembly(fileName: string, assemblyName: string): Promise<string>;

  /**
   * List all PhysicalModels in the iModel (assemblies and parts).
   * @param fileName Absolute path to the .bim file
   */
  listAssemblies(fileName: string): Promise<Array<{ id: string; name: string }>>;
}
