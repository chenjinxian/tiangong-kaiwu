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
 * G1 D5 adds `downloadVersionBriefcase`: an additive, read-only version-open method
 * that targets an immutable changeset id/index or a Named Version. The existing
 * `downloadBriefcase` latest-head method is unchanged (contract 1.0.0 behavior).
 *
 * The former CadFeature EC-schema history API was retired on 2026-11-01:
 * feature history is persisted by FeatureService in the LubanCAD schema, and the
 * legacy path had no callers and no local data to migrate.
 */

import type { Changeset } from './projects/types.js';

/**
 * IPC contract version for `LubanIpcInterface`.
 *
 * - 1.0.0: `downloadBriefcase` (latest head), `createAssembly`, `listAssemblies`.
 * - 1.1.0: additive `downloadVersionBriefcase` read-only version open (G1 D5).
 *
 * Consumers must still tolerate unknown additive methods (the channel dispatch
 * ignores handlers they never call); removing or changing an existing method
 * requires a major version bump and a paired shared → backend → web release.
 */
export const LUBAN_IPC_INTERFACE_VERSION = "1.1.0";

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

/**
 * Immutable version target selector. Exactly one member must be set.
 *
 * - `changesetId`: a sealed changeset id (40 hex). All changesets up to and
 *   including it are applied to the downloaded read-only briefcase.
 * - `changesetIndex`: a changeset index. `0` targets the baseline (no
 *   changesets); `N >= 1` targets the changeset at that index.
 * - `namedVersionId`: a Named Version id (UUID). The Hub must already report a
 *   successful checkpoint bound to that version; otherwise the call fails
 *   closed with `CheckpointNotReady`.
 *
 * The backend resolves the selector to an immutable changeset id/index before
 * downloading. Client-supplied file paths/URLs are never accepted.
 */
export interface VersionOpenTarget {
  changesetId?: string;
  changesetIndex?: number;
  namedVersionId?: string;
}

/** Request for an additive read-only version open (G1 D5). */
export interface VersionOpenRequest {
  iTwinId: string;
  iModelId: string;
  target: VersionOpenTarget;
}

/** Resolved immutable version identity (never the mutable head). */
export interface VersionOpenResolvedTarget {
  /** Sealed changeset id; empty string for the baseline (`changesetIndex: 0`). */
  changesetId: string;
  changesetIndex: number;
  /** Present when the caller selected (or the backend resolved) a Named Version. */
  namedVersionId?: string;
}

/** Result of a read-only version download. */
export interface VersionOpenResult {
  /** Server-assigned local file key (never a client-supplied path). */
  fileName: string;
  /** Always 0: an unassigned, pull-only briefcase. */
  briefcaseId: number;
  /** Exact changeset the returned file is at. */
  changeset: Pick<Changeset, 'id' | 'index'>;
  /** The selector exactly as submitted. */
  requested: VersionOpenTarget;
  /** The immutable identity the selector resolved to. */
  target: VersionOpenResolvedTarget;
  /**
   * Successful checkpoint the backend used as the download base. The native
   * download applies any remaining changesets up to `target`; `changesetId`
   * may be null for the baseline row.
   */
  checkpoint: { changesetId: string | null; changesetIndex: number };
  /** Always true. There is no writable version checkout in this contract. */
  readonly: true;
}

/** Custom IPC interface for LubanCAD backend operations */
export interface LubanIpcInterface {
  /**
   * Locate a cached briefcase or download a new one from iModelHub.
   *
   * Does NOT open the BriefcaseDb — the caller must follow up with
   * BriefcaseConnection.openFile({ fileName }) which triggers openBriefcase IPC.
   *
   * This is the latest-head method and its behavior is unchanged by the
   * additive version-open method below.
   */
  downloadBriefcase(iTwinId: string, iModelId: string, readonly?: boolean): Promise<BriefcaseDownloadResult>;

  /**
   * Download a read-only briefcase at an immutable version target (G1 D5).
   *
   * - Requires an established IPC connection session; calls without one fail closed.
   * - Always uses an unassigned briefcase (`briefcaseId: 0`), never acquires a
   *   briefcase id, never takes the document write lease, and never pushes or
   *   mutates the head.
   * - The server owns the cache path/key and isolates it from the latest-head
   *   download key; the same target is idempotent within a session.
   * - Failures carry stable `code`/`statusCode` fields. A Hub
   *   `CheckpointNotReady` (409) is surfaced with the upstream code; a missing
   *   or unsupported target fails closed instead of opening the head.
   * - Does NOT open the database. Follow up with
   *   `BriefcaseConnection.openFile({ fileName, readonly: true })`.
   */
  downloadVersionBriefcase(request: VersionOpenRequest): Promise<VersionOpenResult>;

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
