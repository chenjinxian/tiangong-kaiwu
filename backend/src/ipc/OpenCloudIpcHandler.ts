/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * OpenCloudIpcHandler — Backend IPC handler for briefcase operations.
 *
 * Registered on the "open-cloud-ipc" channel. Handles the download
 * step that NativeApp would normally perform (not available in web context),
 * plus CAD feature history schema management.
 */

import {
  BriefcaseDb,
  BriefcaseManager,
  IModelDb,
  IModelHost,
  IModelJsFs,
  IpcHandler,
  PhysicalModel,
} from '@itwin/core-backend';
import type { ElementProps, LocalBriefcaseProps } from '@itwin/core-common';
import { BriefcaseIdValue, IModel, IModelError } from '@itwin/core-common';
import { Id64, IModelStatus } from '@itwin/core-bentley';
import {
  openCloudIpcChannel,
  type BriefcaseDownloadResult,
  type CadFeatureRecord,
  type OpenCloudIpcInterface,
} from '@open-cloud-cad/shared';
import {
  OPENCAD_SCHEMA_NAME,
  OPENCAD_SCHEMA_VERSION,
  OPENCAD_SCHEMA_XML,
} from '../schema/OpenCloudCADSchema.js';
import { logger } from '../utils/logger.js';
import { getOpenDbs } from '../utils/itwinInternals.js';

export class OpenCloudIpcHandler extends IpcHandler implements OpenCloudIpcInterface {
  /** IPC channel name — matches openCloudIpcChannel in shared package */
  public get channelName(): string {
    return openCloudIpcChannel;
  }

  /**
   * Per-iModelId in-flight promise. Prevents two concurrent calls from both
   * finding cached.length === 0 and both calling downloadBriefcase.
   *
   * Safe as instance state because IpcHandler.register() creates exactly one
   * instance of this class for the lifetime of the registration.
   */
  private readonly _inFlight = new Map<string, Promise<BriefcaseDownloadResult>>();

  /**
   * Locate cached briefcase or download a new one.
   * Does NOT open the BriefcaseDb.
   */
  public async downloadBriefcase(
    iTwinId: string,
    iModelId: string,
    readonly?: boolean
  ): Promise<BriefcaseDownloadResult> {
    // Serialize concurrent calls for the same iModelId + readonly mode
    const cacheKey = `${iModelId}:${readonly}`;
    const existing = this._inFlight.get(cacheKey);
    if (existing) {
      return existing;
    }

    const work = this._doDownloadBriefcase(iTwinId, iModelId, readonly);
    this._inFlight.set(cacheKey, work);
    try {
      return await work;
    } finally {
      this._inFlight.delete(cacheKey);
    }
  }

  private async _doDownloadBriefcase(
    iTwinId: string,
    iModelId: string,
    readonly?: boolean
  ): Promise<BriefcaseDownloadResult> {
    // 1. Check for existing cached briefcase
    const allCached = BriefcaseManager.getCachedBriefcases(iModelId);
    const cached = readonly
      ? allCached[0]
      : allCached.find((bc) => bc.briefcaseId > 0);
    if (cached) {
      // Note: We do NOT call BriefcaseDb.open() here.
      // BriefcaseConnection.openFile() on the frontend will open it via IPC.
      return {
        fileName: cached.fileName,
        briefcaseId: cached.briefcaseId,
        changeset: { id: cached.changeset?.id ?? '', index: cached.changeset?.index ?? 0 },
      };
    }

    let briefcaseId: number;

    if (readonly) {
      // Read-only mode: use briefcaseId 0 (checkpoint)
      briefcaseId = 0;
    } else {
      // 2. Acquire a valid briefcaseId for editing (must be >= 2 for IsBriefcase() to return true)
      // This is required for _onGeometryChanged events to fire for real-time viewport refresh
      briefcaseId = await BriefcaseManager.acquireNewBriefcaseId({ iModelId });
      if (briefcaseId < BriefcaseIdValue.FirstValid) {
        // If hub returns invalid briefcaseId (e.g., 1), release it and try to get another
        logger.info(`Hub returned invalid briefcaseId ${briefcaseId}, requesting another...`);
        await BriefcaseManager.releaseBriefcase(await IModelHost.getAccessToken(), { iModelId, briefcaseId });
        briefcaseId = await BriefcaseManager.acquireNewBriefcaseId({ iModelId });
      }
      logger.info(`Acquired briefcaseId: ${briefcaseId}`);
    }

    // 3. Attempt download with the acquired briefcaseId
    logger.info(`Downloading briefcase for iModel ${iModelId}, briefcaseId ${briefcaseId}...`);
    let props: LocalBriefcaseProps;
    try {
      props = await BriefcaseManager.downloadBriefcase({ iTwinId, iModelId, briefcaseId });
      logger.info(`Downloaded briefcase: ${props.fileName}, changeset: ${JSON.stringify(props.changeset)}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : '';
      logger.error(`Failed to download briefcase: ${errorMessage}`);
      logger.error(`Error stack: ${errorStack}`);

      // Log detailed error info for CloudSqlite/V2 checkpoint issues
      if (errorMessage.includes('manifest') || errorMessage.includes('Cloud') || errorMessage.includes('checkpoint')) {
        logger.error(`CloudSqlite/V2 Checkpoint error detected for iModel ${iModelId}`);
        logger.error(`Error details: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
      }

      const iModelErr = err instanceof IModelError ? err : undefined;
      if (iModelErr?.errorNumber === IModelStatus.FileAlreadyExists) {
        // Orphaned .bim on disk that wasn't readable by getCachedBriefcases — delete and retry
        const orphaned = BriefcaseManager.getFileName({ iModelId, briefcaseId: 0 });
        logger.info(`Deleting orphaned file: ${orphaned}`);
        IModelJsFs.unlinkSync(orphaned);
        props = await BriefcaseManager.downloadBriefcase({ iTwinId, iModelId, briefcaseId });
      } else {
        throw err;
      }
    }

    // Note: We do NOT call BriefcaseDb.open() here.
    // BriefcaseConnection.openFile() on the frontend will open it via IPC.

    // IMPORTANT: Do NOT call upgradeStandaloneSchemas here.
    // The baseline file from web-agent is already properly created with the correct
    // schema version. Calling upgradeStandaloneSchemas can corrupt the file and
    // break GeometryGuid support needed for real-time viewport refresh.

    logger.info(`downloadBriefcase returning fileName: ${props.fileName}`);
    return {
      fileName: props.fileName,
      briefcaseId: props.briefcaseId,
      changeset: { id: props.changeset?.id ?? '', index: props.changeset?.index ?? 0 },
    };
  }

  // ── CAD Feature History Schema ──────────────────────────────────────────

  /**
   * Ensure the OpenCloudCAD EC schema is imported into the briefcase.
   * Idempotent — checks if schema is already present before importing.
   */
  public async ensureCadSchema(fileName: string): Promise<void> {
    logger.info(`ensureCadSchema called for: ${fileName}`);

    const db = this._findDb(fileName);

    // List all open dbs for debugging
    if (!db) {
      logger.info('Open databases:');
      const openDbs = getOpenDbs() || new Map();
      openDbs.forEach((_, key) => {
        try {
          logger.info(`  - key: ${key}`);
        } catch {
          logger.info(`  - key: ${key}, path: (error)`);
        }
      });
    }

    if (!db) throw new Error(`BriefcaseDb not open: ${fileName}`);

    // Check if schema already imported
    try {
      const existing = db.querySchemaVersion(OPENCAD_SCHEMA_NAME);
      if (existing) return; // already present
    } catch {
      // querySchemaVersion throws if schema not found — that's fine, we'll import it
    }

    await db.importSchemaStrings([OPENCAD_SCHEMA_XML]);
    logger.info(`OpenCloudCAD schema v${OPENCAD_SCHEMA_VERSION} imported into ${fileName}`);
  }

  /**
   * Insert a CadFeature record into the iModel and save.
   */
  private _findDb(fileName: string): BriefcaseDb | undefined {
    const db = IModelDb.findByFilename(fileName);
    // Try absolute path if relative path fails
    if (!db && !fileName.startsWith('/')) {
      const absolutePath = `/Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/apps/backend/${fileName}`;
      const absDb = IModelDb.findByFilename(absolutePath);
      if (absDb?.isBriefcaseDb()) return absDb;
    }
    return db?.isBriefcaseDb() ? db : undefined;
  }

  public async createFeature(
    fileName: string,
    featureType: string,
    params: string,
  ): Promise<string> {
    const db = this._findDb(fileName);
    if (!db) throw new Error(`BriefcaseDb not open: ${fileName}`);

    // Ensure schema is present
    await this.ensureCadSchema(fileName);

    // Count existing features for ordering
    let order = 0;
    for await (const row of db.createQueryReader(
      `SELECT COUNT(*) FROM ${OPENCAD_SCHEMA_NAME}.CadFeature`, undefined, { usePrimaryConn: true }
    )) {
      order = (row[0] as number) ?? 0;
      break;
    }

    // Insert a CadFeature element in the dictionary model (id 0x10)
    const elemProps = {
      classFullName: `${OPENCAD_SCHEMA_NAME}:CadFeature`,
      model: IModel.dictionaryId,
      code: { spec: '0x1', scope: '0x1', value: `Feature_${Date.now()}` },
      userLabel: featureType,
      featureType,
      parameters: params,
      featureOrder: order,
    } as ElementProps & Record<string, unknown>;

    const elemId = db.elements.insertElement(elemProps);

    db.saveChanges(`Add feature: ${featureType}`);
    return elemId;
  }

  /**
   * List all CadFeature records ordered by FeatureOrder.
   */
  public async listFeatures(fileName: string): Promise<CadFeatureRecord[]> {
    const db = this._findDb(fileName);
    if (!db) throw new Error(`BriefcaseDb not open: ${fileName}`);

    // Check if schema is present — return empty array if not
    let hasSchema = false;
    try {
      hasSchema = !!db.querySchemaVersion(OPENCAD_SCHEMA_NAME);
    } catch {
      return [];
    }
    if (!hasSchema) return [];

    const results: CadFeatureRecord[] = [];
    for await (const row of db.createQueryReader(
      `SELECT ECInstanceId, FeatureType, Parameters, FeatureOrder, Suppressed
       FROM ${OPENCAD_SCHEMA_NAME}.CadFeature
       ORDER BY FeatureOrder ASC`,
      undefined,
      { usePrimaryConn: true },
    )) {
      results.push({
        id: Id64.fromJSON(row[0]),
        featureType: (row[1] as string) ?? '',
        params: (row[2] as string) ?? '{}',
        order: (row[3] as number) ?? 0,
        suppressed: (row[4] as boolean) ?? false,
      });
    }
    return results;
  }

  /**
   * Delete a CadFeature record from the iModel.
   */
  public async deleteFeature(fileName: string, featureId: string): Promise<void> {
    const db = this._findDb(fileName);
    if (!db) throw new Error(`BriefcaseDb not open: ${fileName}`);

    db.elements.deleteElement(featureId);
    db.saveChanges(`Delete feature ${featureId}`);
  }

  /**
   * Update a CadFeature record in the iModel.
   */
  public async updateFeature(
    fileName: string,
    featureId: string,
    updates: { featureType?: string; params?: string }
  ): Promise<void> {
    const db = this._findDb(fileName);
    if (!db) throw new Error(`BriefcaseDb not open: ${fileName}`);

    const element = db.elements.getElement(featureId) as unknown as {
      featureType?: string;
      userLabel?: string;
      parameters?: string;
      update(): void;
    };
    if (updates.featureType !== undefined) {
      element.featureType = updates.featureType;
      element.userLabel = updates.featureType;
    }
    if (updates.params !== undefined) {
      element.parameters = updates.params;
    }
    element.update();
    db.saveChanges(`Update feature ${featureId}`);
  }

  /**
   * Suppress or unsuppress a CadFeature record.
   */
  public async setFeatureSuppressed(
    fileName: string,
    featureId: string,
    suppressed: boolean
  ): Promise<void> {
    const db = this._findDb(fileName);
    if (!db) throw new Error(`BriefcaseDb not open: ${fileName}`);

    const element = db.elements.getElement(featureId) as unknown as {
      suppressed?: boolean;
      update(): void;
    };
    element.suppressed = suppressed;
    element.update();
    db.saveChanges(`${suppressed ? 'Suppress' : 'Unsuppress'} feature ${featureId}`);
  }

  /**
   * Reorder a CadFeature by moving it to a new position.
   */
  public async reorderFeature(
    fileName: string,
    featureId: string,
    newOrder: number
  ): Promise<void> {
    const db = this._findDb(fileName);
    if (!db) throw new Error(`BriefcaseDb not open: ${fileName}`);

    // Get all features sorted by order
    const features: Array<{ id: string; order: number }> = [];
    for await (const row of db.createQueryReader(
      `SELECT ECInstanceId, FeatureOrder FROM ${OPENCAD_SCHEMA_NAME}.CadFeature ORDER BY FeatureOrder ASC`,
      undefined,
      { usePrimaryConn: true }
    )) {
      features.push({ id: Id64.fromJSON(row[0]), order: row[1] as number });
    }

    // Find the feature being moved
    const movedFeatureIndex = features.findIndex((f) => f.id === featureId);
    if (movedFeatureIndex === -1) throw new Error(`Feature not found: ${featureId}`);

    // Remove from current position and insert at new position
    const [movedFeature] = features.splice(movedFeatureIndex, 1);
    features.splice(newOrder, 0, movedFeature);

    // Update all feature orders
    for (let i = 0; i < features.length; i++) {
      const element = db.elements.getElement(features[i].id) as unknown as {
        featureOrder?: number;
        update(): void;
      };
      element.featureOrder = i;
      element.update();
    }

    db.saveChanges(`Reorder feature ${featureId} to position ${newOrder}`);
  }

  // ── Assembly System ─────────────────────────────────────────────────────

  /**
   * Create a new PhysicalPartition + PhysicalModel (assembly) under the root Subject.
   * Uses iTwin.js SubModel hierarchy: each assembly is a named PhysicalModel.
   */
  public async createAssembly(fileName: string, assemblyName: string): Promise<string> {
    const db = this._findDb(fileName);
    if (!db) throw new Error(`BriefcaseDb not open: ${fileName}`);

    // Get the root Subject id
    const rootSubjectId = db.elements.getRootSubject().id;

    // Insert PhysicalPartition + PhysicalModel (returns model id = partition id)
    const modelId = PhysicalModel.insert(db, rootSubjectId, assemblyName);
    db.saveChanges(`Create assembly: ${assemblyName}`);

    return modelId;
  }

  /**
   * List all PhysicalModels in the iModel.
   */
  public async listAssemblies(fileName: string): Promise<Array<{ id: string; name: string }>> {
    const db = this._findDb(fileName);
    if (!db) throw new Error(`BriefcaseDb not open: ${fileName}`);

    const results: Array<{ id: string; name: string }> = [];
    for await (const row of db.createQueryReader(
      `SELECT m.ECInstanceId, e.CodeValue
       FROM bis.PhysicalModel m
       JOIN bis.PhysicalPartition e ON e.ECInstanceId = m.ModeledElement.Id
       ORDER BY e.CodeValue ASC`,
      undefined,
      { usePrimaryConn: true },
    )) {
      results.push({
        id: Id64.fromJSON(row[0]),
        name: (row[1] as string) ?? 'Unnamed',
      });
    }
    return results;
  }
}
