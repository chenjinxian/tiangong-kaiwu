/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Custom IPC interface for LubanCAD briefcase operations.
 *
 * IpcApp.appFunctionIpc already handles openBriefcase/saveChanges/pushChanges/pullChanges.
 * This interface adds only the initial download step that NativeApp would normally handle,
 * plus the physical-assembly helpers used by the editor.
 *
 * The former CadFeature EC-schema history API was retired on 2026-11-01:
 * feature history is persisted by FeatureService in the LubanCAD schema, and the
 * legacy path had no callers and no local data to migrate.
 */

import type { Changeset } from './projects/types.js';

/** IPC channel name for LubanCAD custom operations */
export const lubanIpcChannel = "luban-ipc";

/** Result returned after briefcase is located/downloaded on the backend */
export interface BriefcaseDownloadResult {
  /** Absolute path to the .bim file on the backend's disk */
  fileName: string;
  /** The briefcase ID assigned by iModelHub */
  briefcaseId: number;
  /** The changeset this briefcase is currently at */
  changeset: Pick<Changeset, 'id' | 'index'>;
}

/** Custom IPC interface for LubanCAD backend operations */
export interface LubanIpcInterface {
  /**
   * Locate a cached briefcase or download a new one from iModelHub.
   *
   * Does NOT open the BriefcaseDb — the caller must follow up with
   * BriefcaseConnection.openFile({ fileName }) which triggers openBriefcase IPC.
   */
  downloadBriefcase(iTwinId: string, iModelId: string, readonly?: boolean): Promise<BriefcaseDownloadResult>;

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
