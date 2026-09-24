/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Baseline File Generator
 *
 * Generates empty baseline .bim files for iModels using iTwin.js SnapshotDb.
 * Uploads generated files to Azurite using CloudSqlite BCVV format so that
 * the backend can open them via the real V2CheckpointManager mechanism.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { randomUUID } from 'crypto';
import {
  BlobServiceClient,
  ContainerSASPermissions,
  SASProtocol,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import type { IModelCreatedEvent, WebhookEvent } from './types.js';

export interface BaselineGeneratorConfig {
  /** Azurite blob storage URL (e.g. http://127.0.0.1:10000/devstoreaccount1) */
  blobStorageUrl: string;
  /** Blob storage account name */
  blobAccountName: string;
  /** Blob storage account key */
  blobAccountKey: string;
  /** Container name for baseline files (unused - each iModel gets its own container) */
  blobContainerName: string;
  /** imodelhub-services API URL */
  imodelhubApiUrl: string;
  /** API key for imodelhub-services */
  imodelhubApiKey?: string;
  /** Temporary directory for file generation */
  tempDir?: string;
  /** Optional callback for progress updates */
  onProgress?: (iModelId: string, step: string, progress: number) => void;
}

interface DirectoryAccessInfo {
  baseUrl: string;
  storage: string;
  baseDirectory: string;
  storageType: string;
  azure?: { sasToken: string };
}

interface BaselineGenerationResult {
  success: boolean;
  iModelId: string;
  directoryAccessInfo?: DirectoryAccessInfo;
  fileSize?: number;
  error?: string;
}

/**
 * Baseline File Generator
 *
 * Handles async generation of empty baseline files for iModels.
 * Uses CloudSqlite to upload in BCVV format so the V2CheckpointManager
 * can open the checkpoint via block-streaming from Azurite.
 */
export class BaselineGenerator {
  private _config: BaselineGeneratorConfig;
  private _credential: StorageSharedKeyCredential;
  private _blobClient: BlobServiceClient;
  private _initialized: boolean = false;

  constructor(config: BaselineGeneratorConfig) {
    this._config = {
      tempDir: os.tmpdir(),
      ...config,
    };

    this._credential = new StorageSharedKeyCredential(
      config.blobAccountName,
      config.blobAccountKey
    );
    this._blobClient = new BlobServiceClient(
      config.blobStorageUrl,
      this._credential
    );
  }

  /**
   * Initialize the generator
   */
  public async initialize(): Promise<void> {
    if (this._initialized) return;
    // eslint-disable-next-line no-console
    console.log('[BaselineGenerator] Initialized (imodels-clients createFromBaseline pattern)');
    this._initialized = true;
  }

  /**
   * Report progress via callback
   */
  private _reportProgress(iModelId: string, step: string, progress: number): void {
    try {
      this._config.onProgress?.(iModelId, step, progress);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[BaselineGenerator] Progress callback error:', error);
    }
  }

  /**
   * Handle iModel created event - generate baseline file
   */
  public async handleIModelCreated(
    event: WebhookEvent,
    content: IModelCreatedEvent
  ): Promise<BaselineGenerationResult> {
    const { imodelId, imodelName } = content;

    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Processing iModel ${imodelId} (${imodelName})`);

    try {
      this._reportProgress(imodelId, '准备生成 baseline', 10);

      // Generate empty baseline file with correct iModelId and iTwinId
      const localFilePath = await this._generateEmptyBaseline(imodelId, event.iTwinId);
      this._reportProgress(imodelId, '正在生成 baseline 文件', 30);

      // Get file size
      const stats = await fs.stat(localFilePath);
      const fileSize = stats.size;

      // Upload following imodels-clients createFromBaseline pattern
      const directoryAccessInfo = await this._uploadViaCloudSqlite(localFilePath, imodelId);
      this._reportProgress(imodelId, '正在上传至存储', 60);

      // Note: _uploadViaCloudSqlite now handles the complete flow including:
      // - Get upload URL from API
      // - Upload file to Azure
      // - Confirm upload
      // - Wait for initialization
      this._reportProgress(imodelId, '正在等待初始化完成', 90);

      // Cleanup temp file
      await fs.unlink(localFilePath).catch(() => {
        // Ignore cleanup errors
      });

      this._reportProgress(imodelId, '完成', 100);
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Completed for iModel ${imodelId}`);

      return {
        success: true,
        iModelId: imodelId,
        directoryAccessInfo,
        fileSize,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // eslint-disable-next-line no-console
      console.error(`[BaselineGenerator] Failed for iModel ${imodelId}:`, error);

      // Notify failure
      await this._notifyFailure(imodelId, errorMessage).catch(() => {
        // Ignore notification errors
      });

      return {
        success: false,
        iModelId: imodelId,
        error: errorMessage,
      };
    }
  }

  /**
   * Process user-uploaded baseline file.
   *
   * When a user uploads their own .bim file, it needs to be converted
   * to CloudSqlite BCVV format before V2CheckpointManager can open it.
   *
   * This method:
   * 1. Downloads the original file from Azurite
   * 2. Converts it to CloudSqlite BCVV format
   * 3. Re-uploads to Azurite
   * 4. Notifies imodelhub-services of completion
   */
  public async processUserBaseline(
    iModelId: string,
    iTwinId: string,
    sourceBlobPath: string,
    fileSize: number
  ): Promise<BaselineGenerationResult> {
    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Processing user-uploaded baseline for iModel ${iModelId}`);
    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Source: ${sourceBlobPath}`);

    const tempFilePath = path.join(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this._config.tempDir!,
      `user_baseline_${iModelId}_${Date.now()}.bim`
    );

    try {
      this._reportProgress(iModelId, '准备处理 baseline', 10);

      // Step 1: Download the original file from Azurite
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Downloading original file...`);
      await this._downloadFromAzurite(sourceBlobPath, tempFilePath);
      this._reportProgress(iModelId, '正在下载原始文件', 30);

      // Step 2: Validate and fix the iModelId/iTwinId in the file
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Validating baseline file...`);
      await this._validateAndFixBaseline(tempFilePath, iModelId, iTwinId);
      this._reportProgress(iModelId, '正在验证 baseline 文件', 50);

      // Step 3: Upload following imodels-clients createFromBaseline pattern
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Uploading via standard API flow...`);
      const directoryAccessInfo = await this._uploadViaCloudSqlite(tempFilePath, iModelId);
      this._reportProgress(iModelId, '正在上传至存储', 70);

      // Note: _uploadViaCloudSqlite now handles the complete flow including confirmation and initialization wait
      this._reportProgress(iModelId, '正在等待初始化完成', 90);

      // Cleanup temp file
      await fs.unlink(tempFilePath).catch(() => {
        // Ignore cleanup errors
      });

      this._reportProgress(iModelId, '完成', 100);
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] User baseline processed for iModel ${iModelId}`);

      return {
        success: true,
        iModelId: iModelId,
        directoryAccessInfo,
        fileSize,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Cleanup on failure
      await fs.unlink(tempFilePath).catch(() => {
        // Ignore cleanup errors
      });

      // eslint-disable-next-line no-console
      console.error(`[BaselineGenerator] Failed to process user baseline for iModel ${iModelId}:`, error);

      // Notify failure
      await this._notifyFailure(iModelId, errorMessage).catch(() => {
        // Ignore notification errors
      });

      return {
        success: false,
        iModelId: iModelId,
        error: errorMessage,
      };
    }
  }

  /**
   * Download file from Azurite to local path
   */
  private async _downloadFromAzurite(blobPath: string, localFilePath: string): Promise<void> {
    // The blobPath from backend includes the full path within the container
    // e.g., "imodels/{id}/baseline/JoesHouse.bim"
    // We use the configured container name, not the first path segment
    const containerName = this._config.blobContainerName;
    const blobName = blobPath;

    const containerClient = this._blobClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Download to local file
    await blockBlobClient.downloadToFile(localFilePath);

    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Downloaded ${blobPath} to ${localFilePath}`);
  }

  /**
   * Validate and fix the iModelId/iTwinId in a baseline file
   *
   * Handles both StandaloneDb and BriefcaseDb files.
   * For auto-generated baselines (BriefcaseDb), the IDs are already set correctly.
   * For user-uploaded files, validates and fixes the IDs if needed.
   */
  private async _validateAndFixBaseline(
    filePath: string,
    expectedIModelId: string,
    expectedITwinId: string
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { BriefcaseDb, SnapshotDb, IModelHost, IModelDb, IModelJsFs } = await import('@itwin/core-backend');
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { OpenMode } = await import('@itwin/core-bentley');

    // Ensure IModelHost is started
    await IModelHost.startup();

    // First, check what type of file this is by examining it with the native Db
    // We need to determine if it's a BriefcaseDb (has proper iTwinId) or a StandaloneDb
    let isBriefcaseFormat = false;
    let currentIModelId = '';
    let currentITwinId = '';

    try {
      // Try to open with native Db to check the format
      const tempDb = IModelDb.openDgnDb({ path: filePath }, OpenMode.ReadWrite);
      try {
        currentIModelId = tempDb.getIModelId();
        currentITwinId = tempDb.getITwinId();
        // If it has a valid iTwinId, it's likely a Briefcase format
        isBriefcaseFormat = !!(currentITwinId && currentITwinId.length > 0 && currentITwinId !== '00000000-0000-0000-0000-000000000000');
      } finally {
        tempDb.closeFile();
      }
    } catch (error) {
      // If we can't open it as a native Db, try other approaches
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Could not inspect file with native Db, will try BriefcaseDb approach: ${error}`);
      isBriefcaseFormat = true; // Assume Briefcase format for safety
    }

    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Current IDs - iModel: ${currentIModelId}, iTwin: ${currentITwinId}`);
    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Expected IDs - iModel: ${expectedIModelId}, iTwin: ${expectedITwinId}`);
    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Detected format: ${isBriefcaseFormat ? 'BriefcaseDb' : 'StandaloneDb'}`);

    if (isBriefcaseFormat) {
      // For BriefcaseDb files, open with BriefcaseDb and validate/fix
      let db;
      try {
        db = await BriefcaseDb.open({ fileName: filePath });
      } catch {
        // If we can't open as BriefcaseDb, it might need to be opened differently
        // Try to open using native Db for direct manipulation
        const nativeDb = IModelDb.openDgnDb({ path: filePath }, OpenMode.ReadWrite);
        try {
          if (nativeDb.getIModelId() !== expectedIModelId) {
            nativeDb.setIModelId(expectedIModelId);
          }
          if (nativeDb.getITwinId() !== expectedITwinId) {
            nativeDb.setITwinId(expectedITwinId);
          }
          nativeDb.saveLocalValue('NoLocking', 'true');
          nativeDb.saveChanges();
        } finally {
          nativeDb.closeFile();
        }
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Validated and fixed baseline file using native Db`);
        return;
      }

      try {
        // Check and fix IDs using nativeDb
        const nativeDbSym = Symbol.for('nativeDb_core-backend_INTERNAL_ONLY_DO_NOT_USE');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nativeDb = (db as any)[nativeDbSym];

        if (nativeDb.getIModelId() !== expectedIModelId) {
          nativeDb.setIModelId(expectedIModelId);
          // eslint-disable-next-line no-console
          console.log(`[BaselineGenerator] Fixed iModelId`);
        }

        if (nativeDb.getITwinId() !== expectedITwinId) {
          nativeDb.setITwinId(expectedITwinId);
          // eslint-disable-next-line no-console
          console.log(`[BaselineGenerator] Fixed iTwinId`);
        }

        // Enable no-lock mode
        nativeDb.saveLocalValue('NoLocking', 'true');
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Enabled no-lock mode for user baseline`);

        db.saveChanges();
      } finally {
        db.close();
      }
    } else {
      // For files that are not in Briefcase format, use nativeDb for direct manipulation
      const nativeDb = IModelDb.openDgnDb({ path: filePath }, OpenMode.ReadWrite);
      try {

        if (nativeDb.getIModelId() !== expectedIModelId) {
          nativeDb.setIModelId(expectedIModelId);
        }

        if (nativeDb.getITwinId() !== expectedITwinId) {
          nativeDb.setITwinId(expectedITwinId);
        }

        nativeDb.saveLocalValue('NoLocking', 'true');
        nativeDb.saveChanges();
      } finally {
        nativeDb.closeFile();
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Validated and fixed baseline file`);
  }

  /**
   * Generate empty baseline file using iTwin.js SnapshotDb
   *
   * Creates a minimal iModel with:
   * - Default PhysicalModel for 3D geometry
   * - Default GeometricCategory for element styling
   * - Required for editing tools to work
   */
  private async _generateEmptyBaseline(iModelId: string, iTwinId: string): Promise<string> {
    const tempFilePath = path.join(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this._config.tempDir!,
      `baseline_${iModelId}_${Date.now()}.bim`
    );

    try {
      // Follow WebEditHost.createBaselineFile implementation from web-service-backend
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { SnapshotDb, BriefcaseDb, IModelHost, IModelDb, IModelJsFs, BriefcaseLocalValue, DefinitionModel, PhysicalModel, SpatialCategory, DisplayStyle3d, ModelSelector, CategorySelector, SpatialViewDefinition } = await import('@itwin/core-backend');
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { OpenMode } = await import('@itwin/core-bentley');
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { BriefcaseIdValue, ColorByName, SubCategoryAppearance, IModel, RenderMode, ViewFlags } = await import('@itwin/core-common');
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { Range3d } = await import('@itwin/core-geometry');

      // Initialize IModelHost if not already initialized
      await IModelHost.startup();

      // Remove any existing file
      IModelJsFs.removeSync(tempFilePath);

      // Step 1: Create empty baseline file using SnapshotDb
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Creating empty baseline file...`);
      const emptyBaseline = SnapshotDb.createEmpty(tempFilePath, { rootSubject: { name: 'Empty iModel' } });
      emptyBaseline.saveChanges();
      emptyBaseline.close();

      // Step 2: Prepare the baseline file using native Db
      const nativeDb = IModelDb.openDgnDb({ path: tempFilePath }, OpenMode.ReadWrite);
      try {
        nativeDb.setITwinId(iTwinId);
        nativeDb.saveChanges();
        // cSpell:disable-next-line
        nativeDb.deleteAllTxns(); // necessary before resetting briefcaseId
        nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned);
        nativeDb.saveLocalValue(BriefcaseLocalValue.NoLocking, 'true');
        nativeDb.saveChanges();
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Prepared baseline file`);
      } finally {
        nativeDb.closeFile();
      }

      // Step 3: Open as BriefcaseDb and add default content (following web-service-backend pattern)
      let briefcaseDb;
      try {
        briefcaseDb = await BriefcaseDb.open({ fileName: tempFilePath });
      } catch (error) {
        // If we can't open as BriefcaseDb, return the file as-is
        return tempFilePath;
      }

      try {
        // Set larger project extents (1000 x 1000 x 1000 meters centered at origin)
        // This provides adequate space for most CAD models
        const largeExtents = new Range3d(-500, -500, -100, 500, 500, 400);
        briefcaseDb.updateProjectExtents(largeExtents);
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Set project extents to: ${JSON.stringify(largeExtents.toJSON())}`);

        // Create DefinitionModel for category
        const definitionModelId = DefinitionModel.insert(briefcaseDb, IModelDb.rootSubjectId, 'Definitions');

        // Create default SpatialCategory for element styling
        const categoryId = SpatialCategory.insert(briefcaseDb, definitionModelId, 'Default Category', new SubCategoryAppearance({ color: ColorByName.white }));
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Created SpatialCategory: ${categoryId}`);

        // Create default PhysicalModel for 3D geometry
        const modelId = PhysicalModel.insert(briefcaseDb, IModel.rootSubjectId, 'Default Physical Model');
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Created PhysicalModel: ${modelId}`);

        // Create default view components with proper lighting
        const displayStyleId = DisplayStyle3d.insert(briefcaseDb, IModelDb.dictionaryId, 'default', {
          viewFlags: new ViewFlags({ renderMode: RenderMode.SmoothShade, lighting: true }),
          backgroundColor: ColorByName.black,
          lights: {
            // Portrait light (camera-mounted light)
            portrait: { intensity: 0.4 },
            // Solar light (directional sun light, always enabled)
            solar: { intensity: 0.8, alwaysEnabled: true },
            // Ambient light (soft fill)
            ambient: { intensity: 0.3 },
            // Hemisphere light (sky/ground ambient) - single intensity for both colors
            hemisphere: { intensity: 0.4 },
            // Specular highlights
            specularIntensity: 0.4,
          },
        });

        // Create additional display styles for different rendering modes
        DisplayStyle3d.insert(briefcaseDb, IModelDb.dictionaryId, 'Wireframe', {
          viewFlags: new ViewFlags({ renderMode: RenderMode.Wireframe, lighting: false }),
          backgroundColor: ColorByName.black,
        });

        DisplayStyle3d.insert(briefcaseDb, IModelDb.dictionaryId, 'Hidden Line', {
          viewFlags: new ViewFlags({ renderMode: RenderMode.HiddenLine, lighting: false }),
          backgroundColor: ColorByName.white,
        });

        DisplayStyle3d.insert(briefcaseDb, IModelDb.dictionaryId, 'Solid Fill', {
          viewFlags: new ViewFlags({ renderMode: RenderMode.SolidFill, lighting: false }),
          backgroundColor: ColorByName.black,
        });

        DisplayStyle3d.insert(briefcaseDb, IModelDb.dictionaryId, 'Illustration', {
          viewFlags: new ViewFlags({ renderMode: RenderMode.SmoothShade, lighting: true, visibleEdges: true }),
          backgroundColor: ColorByName.white,
          lights: {
            portrait: { intensity: 0.5 },
            solar: { intensity: 0.6, alwaysEnabled: true },
            ambient: { intensity: 0.4 },
            hemisphere: { intensity: 0.3 },
            specularIntensity: 0.2,
          },
        });

        DisplayStyle3d.insert(briefcaseDb, IModelDb.dictionaryId, 'Monochrome', {
          viewFlags: new ViewFlags({ renderMode: RenderMode.SmoothShade, lighting: true, monochrome: true }),
          backgroundColor: ColorByName.black,
          monochromeColor: ColorByName.white,
          lights: {
            portrait: { intensity: 0.3 },
            solar: { intensity: 0.5, alwaysEnabled: true },
            ambient: { intensity: 0.5 },
            hemisphere: { intensity: 0.3 },
            specularIntensity: 0.1,
          },
        });

        const modelSelectorId = ModelSelector.insert(briefcaseDb, IModelDb.dictionaryId, 'default', [modelId]);
        const categorySelectorId = CategorySelector.insert(briefcaseDb, IModelDb.dictionaryId, 'default', [categoryId]);

        // Create spatial view definition
        SpatialViewDefinition.insertWithCamera(briefcaseDb, IModelDb.dictionaryId, 'default', modelSelectorId, categorySelectorId, displayStyleId, briefcaseDb.projectExtents);

        briefcaseDb.saveChanges();
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Created baseline with default view`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[BaselineGenerator] Error adding content:`, error);
      } finally {
        briefcaseDb.close();
      }

      // Step 4: Set iModelId after content is added
      const nativeDb2 = IModelDb.openDgnDb({ path: tempFilePath }, OpenMode.ReadWrite);
      try {
        nativeDb2.setIModelId(iModelId);
        nativeDb2.saveChanges();
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Set iModelId: ${iModelId}`);
      } finally {
        nativeDb2.closeFile();
      }

      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Completed baseline at ${tempFilePath}`);

      return tempFilePath;
    } catch (error) {
      // Cleanup on failure
      await fs.unlink(tempFilePath).catch(() => {
        // Ignore cleanup errors
      });
      throw error;
    }
  }

  /**
   * Upload file to Azure Blob Storage following imodels-clients createFromBaseline pattern.
   *
   * Standard flow:
   * 1. Create CloudSqlite container and upload .bim file as BCVV
   * 2. Call API to confirm upload
   * 3. Poll for initialization completion
   */
  private async _uploadViaCloudSqlite(
    localFilePath: string,
    iModelId: string
  ): Promise<DirectoryAccessInfo> {
    // Step 1: Create container and upload .bim file using CloudSqlite
    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Creating CloudSqlite container for ${iModelId}...`);
    await this._createCloudContainerAndUpload(localFilePath, iModelId);

    // Step 2: Get upload URL from imodelhub-services (for confirmation)
    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Requesting upload URL from imodelhub-services...`);
    const uploadInfo = await this._getBaselineUploadUrl(iModelId, 0);

    // Step 3: Confirm upload completion with directoryAccessInfo
    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Confirming upload completion...`);
    const sasToken = await this._generateSasToken(iModelId, false);
    await this._confirmBaselineUpload(iModelId, uploadInfo.confirmationUrl, {
      baseUrl: this._config.blobStorageUrl,
      storage: this._config.blobAccountName,
      baseDirectory: iModelId,
      storageType: 'azure',
      azure: { sasToken },
    });

    // Step 4: Poll for initialization completion
    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Waiting for baseline initialization...`);
    await this._waitForBaselineInitialization(iModelId);

    // Generate read SAS token for the container
    const readSasToken = await this._generateSasToken(iModelId, false);

    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Baseline upload completed for iModel ${iModelId}`);

    return {
      baseUrl: this._config.blobStorageUrl,
      storage: this._config.blobAccountName,
      baseDirectory: iModelId,
      storageType: 'azure',
      azure: { sasToken: readSasToken },
    };
  }

  /**
   * Create CloudSqlite container and upload .bim file using CloudSqlite API
   */
  private async _createCloudContainerAndUpload(localFilePath: string, iModelId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { IModelHost, CloudSqlite } = await import('@itwin/core-backend');

    // Ensure IModelHost is started
    await IModelHost.startup();

    // Create a temporary cache directory
    const cacheDir = path.join(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this._config.tempDir!,
      `cloudcache_${iModelId}_${Date.now()}`
    );
    await fs.mkdir(cacheDir, { recursive: true });

    try {
      // Step 1: Create Azure Blob Container with metadata (required for CloudSqlite)
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Creating Azure container ${iModelId} with metadata...`);
      const containerClient = this._blobClient.getContainerClient(iModelId);

      // Check if container exists first
      const exists = await containerClient.exists();
      if (!exists) {
        // Create with metadata required by CloudSqlite
        // Following iTwin.js AzuriteTest pattern exactly
        await containerClient.create({
          access: 'blob',
          metadata: {
            containertype: 'cloud-sqlite',
            itwinid: iModelId,
            label: 'LubanCAD Baseline',
            description: 'CloudSqlite container for LubanCAD',
            json: JSON.stringify({ blockSize: '4M' }),
          },
        });
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Created Azure container with metadata`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Azure container already exists`);
      }

      // Step 2: Create/get CloudCache
      const cache = CloudSqlite.CloudCaches.getCache({
        cacheName: `cache_${iModelId}`,
        cacheDir,
        cacheSize: '1G',
      });

      // Step 3: Generate write SAS token for the container
      const writeSasToken = await this._generateSasToken(iModelId, true);

      // Step 4: Create CloudContainer
      const container = CloudSqlite.createCloudContainer({
        containerId: iModelId,
        storageType: 'azure',
        baseUri: `${this._config.blobStorageUrl}`,
        accessToken: writeSasToken,
        writeable: true,
      });

      // Step 5: Initialize container FIRST (creates manifest.bcv in Azure)
      // This must be called BEFORE connect() for a new container
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Initializing container ${iModelId}...`);
      container.initializeContainer({ blockSize: 4 * 1024 * 1024 }); // 4MB block size
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Container initialized`);

      // Step 6: Connect container to cache
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Connecting to container...`);
      container.connect(cache);
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Connected to container`);

      // Step 7: Upload the .bim file as a database in the container (with write lock)
      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Uploading database...`);
      await CloudSqlite.withWriteLock({ user: 'webhook-agent', container }, async () => {
        await CloudSqlite.uploadDb(container, {
          dbName: 'baseline.bim',
          localFileName: localFilePath,
        });
      });

      // eslint-disable-next-line no-console
      console.log(`[BaselineGenerator] Database uploaded successfully`);

      // Disconnect container (with detach to clean up cache)
      container.disconnect({ detach: true });

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[BaselineGenerator] Cloud container error:`, error);
      throw error;
    } finally {
      // Cleanup cache
      CloudSqlite.CloudCaches.dropCache(`cache_${iModelId}`)?.destroy();
      await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {
        // Ignore cleanup errors
      });
    }
  }

  /**
   * Get baseline upload URL from imodelhub-services
   * Following the pattern from imodels-clients createFromBaseline
   */
  private async _getBaselineUploadUrl(
    iModelId: string,
    fileSize: number
  ): Promise<{ uploadUrl: string; confirmationUrl: string }> {
    const url = `${this._config.imodelhubApiUrl}/imodels/${iModelId}/baseline/upload-url`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this._config.imodelhubApiKey) {
      headers['X-API-Key'] = this._config.imodelhubApiKey;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileSize,
        fileName: 'baseline.bim',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get upload URL: HTTP ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { uploadUrl: string; confirmationUrl: string };
    return data;
  }

  /**
   * Upload file to Azure Blob Storage using the provided URL
   * Following the pattern from imodels-clients cloudStorage.upload
   */
  private async _uploadFileToAzure(localFilePath: string, uploadUrl: string): Promise<void> {
    // Read file content
    const fileContent = await fs.readFile(localFilePath);

    // Upload using the SAS URL
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-ms-blob-type': 'BlockBlob',
        'Content-Length': fileContent.length.toString(),
      },
      body: fileContent,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload file: HTTP ${response.status} - ${errorText}`);
    }

    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] File uploaded successfully`);
  }

  /**
   * Confirm baseline upload completion
   * Following the pattern from imodels-clients (call complete link)
   */
  private async _confirmBaselineUpload(
    iModelId: string,
    confirmationUrl: string,
    directoryAccessInfo: DirectoryAccessInfo
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this._config.imodelhubApiKey) {
      headers['X-API-Key'] = this._config.imodelhubApiKey;
    }

    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Confirming with directoryAccessInfo:`, JSON.stringify(directoryAccessInfo, null, 2));

    const response = await fetch(confirmationUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ directoryAccessInfo }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to confirm upload: HTTP ${response.status} - ${errorText}`);
    }

    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Upload confirmed`);
  }

  /**
   * Wait for baseline file initialization
   * Following the pattern from imodels-clients waitForBaselineFileInitialization
   */
  private async _waitForBaselineInitialization(
    iModelId: string,
    timeOutInMs: number = 300000 // 5 minutes default
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeOutInMs) {
      const state = await this._getBaselineFileState(iModelId);

      if (state === 'initialized') {
        // eslint-disable-next-line no-console
        console.log(`[BaselineGenerator] Baseline initialized successfully`);
        return;
      }

      if (state === 'initializationFailed') {
        throw new Error('Baseline file initialization failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Timed out waiting for baseline file initialization');
  }

  /**
   * Get baseline file state from imodelhub-services
   */
  private async _getBaselineFileState(iModelId: string): Promise<string> {
    const url = `${this._config.imodelhubApiUrl}/imodels/${iModelId}/baseline`;

    const headers: Record<string, string> = {};
    if (this._config.imodelhubApiKey) {
      headers['X-API-Key'] = this._config.imodelhubApiKey;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to get baseline state: HTTP ${response.status}`);
    }

    const data = await response.json() as { state: string };
    return data.state;
  }

  /**
   * Generate a SAS token for the given container.
   * Returns just the query string portion (without leading "?").
   */
  private async _generateSasToken(containerId: string, writable: boolean): Promise<string> {
    const containerClient = this._blobClient.getContainerClient(containerId);
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.valueOf() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const permissions = writable
      ? ContainerSASPermissions.parse('racwdl')
      : ContainerSASPermissions.parse('rl');
    const sasUrl = await containerClient.generateSasUrl({ permissions, startsOn, expiresOn, protocol: SASProtocol.HttpsAndHttp });
    // Extract just the query string (after '?')
    return sasUrl.split('?')[1] ?? '';
  }

  /**
   * Notify imodelhub-services of successful baseline generation
   */
  private async _notifyCompletion(
    iModelId: string,
    fileSize: number,
    directoryAccessInfo: DirectoryAccessInfo
  ): Promise<void> {
    const url = `${this._config.imodelhubApiUrl}/imodels/${iModelId}/baseline/complete`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this._config.imodelhubApiKey) {
      headers['X-API-Key'] = this._config.imodelhubApiKey;
    }

    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Notifying completion with directoryAccessInfo:`, JSON.stringify(directoryAccessInfo, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileSize,
        fileName: 'baseline.bim',
        briefcaseId: randomUUID(),
        directoryAccessInfo,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to notify completion: HTTP ${response.status}`);
    }

    // eslint-disable-next-line no-console
    console.log(`[BaselineGenerator] Notified completion for iModel ${iModelId}`);
  }

  /**
   * Notify imodelhub-services of baseline generation failure
   */
  private async _notifyFailure(iModelId: string, error: string): Promise<void> {
    const url = `${this._config.imodelhubApiUrl}/imodels/${iModelId}/baseline/failed`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this._config.imodelhubApiKey) {
      headers['X-API-Key'] = this._config.imodelhubApiKey;
    }

    try {
      await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ error }),
      });
    } catch (notifyError) {
      // eslint-disable-next-line no-console
      console.error('[BaselineGenerator] Failed to notify failure:', notifyError);
    }
  }

  /**
   * Shutdown the generator
   */
  public async shutdown(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const { IModelHost } = await import('@itwin/core-backend');
      await IModelHost.shutdown();
    } catch {
      // Ignore shutdown errors
    }

    this._initialized = false;
  }
}
