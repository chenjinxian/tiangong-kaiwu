/**
 * Test script to verify downloaded baseline file supports graphical editing
 *
 * This tests the full flow:
 * 1. Create baseline file
 * 2. Upload to Azurite via CloudSqlite
 * 3. Download via BriefcaseManager.downloadBriefcase
 * 4. Verify isGraphicalEditingSupported is still true
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

// Azurite config
const AZURITE_URL = 'http://127.0.0.1:10000/devstoreaccount1';
const AZURITE_ACCOUNT = 'devstoreaccount1';
const AZURITE_KEY = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
const IMODELHUB_URL = 'http://localhost:3002';

async function testDownloadedBaseline(): Promise<void> {
  const iModelId = randomUUID();
  const iTwinId = randomUUID();
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `baseline_${iModelId}_${Date.now()}.bim`);

  console.log(`[Test] iModelId: ${iModelId}`);
  console.log(`[Test] iTwinId: ${iTwinId}`);

  const tempCacheDir = path.join(os.tmpdir(), `test-cache-${Date.now()}`);

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { SnapshotDb, BriefcaseDb, BriefcaseManager, IModelHost, IModelDb, IModelJsFs, BriefcaseLocalValue, DefinitionModel, PhysicalModel, SpatialCategory, DisplayStyle3d, ModelSelector, CategorySelector, SpatialViewDefinition, CloudSqlite } = await import('@itwin/core-backend');
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { OpenMode } = await import('@itwin/core-bentley');
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { BriefcaseIdValue, ColorByName, SubCategoryAppearance, IModel, RenderMode, ViewFlags } = await import('@itwin/core-common');
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { StorageSharedKeyCredential, BlobServiceClient } = await import('@azure/storage-blob');
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { BackendIModelsAccess } = await import('@itwin/imodels-access-backend');
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { IModelsClient } = await import('@itwin/imodels-client-authoring');
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { AzureClientStorage, BlockBlobClientWrapperFactory } = await import('@itwin/object-storage-azure');

  // Set Azurite base URI for CheckpointManager
  process.env.IMJS_AZURE_BLOB_BASE_URI = AZURITE_URL;

  await IModelHost.startup({ cacheDir: tempCacheDir });
  console.log(`[Test] IModelHost started with cache: ${tempCacheDir}`);

  try {
    // Step 1: Create baseline file
    console.log(`\n[Test] === Step 1: Creating baseline file ===`);
    IModelJsFs.removeSync(tempFilePath);
    const emptyBaseline = SnapshotDb.createEmpty(tempFilePath, { rootSubject: { name: 'Test iModel' } });
    emptyBaseline.saveChanges();
    emptyBaseline.close();
    console.log(`[Test] Empty baseline created`);

    // Prepare with native Db
    const nativeDb = IModelDb.openDgnDb({ path: tempFilePath }, OpenMode.ReadWrite);
    try {
      nativeDb.setITwinId(iTwinId);
      nativeDb.saveChanges();
      nativeDb.deleteAllTxns();
      nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned);
      nativeDb.saveLocalValue(BriefcaseLocalValue.NoLocking, 'true');
      nativeDb.saveChanges();
    } finally {
      nativeDb.closeFile();
    }

    // Open as BriefcaseDb and add content
    let briefcaseDb = await BriefcaseDb.open({ fileName: tempFilePath });
    try {
      const definitionModelId = DefinitionModel.insert(briefcaseDb, IModelDb.rootSubjectId, 'Definitions');
      const categoryId = SpatialCategory.insert(briefcaseDb, definitionModelId, 'Default Category', new SubCategoryAppearance({ color: ColorByName.white }));
      const modelId = PhysicalModel.insert(briefcaseDb, IModel.rootSubjectId, 'Default Physical Model');

      const displayStyleId = DisplayStyle3d.insert(briefcaseDb, IModelDb.dictionaryId, 'default', {
        viewFlags: new ViewFlags({ renderMode: RenderMode.SmoothShade }),
        backgroundColor: ColorByName.black,
      });
      const modelSelectorId = ModelSelector.insert(briefcaseDb, IModelDb.dictionaryId, 'default', [modelId]);
      const categorySelectorId = CategorySelector.insert(briefcaseDb, IModelDb.dictionaryId, 'default', [categoryId]);
      SpatialViewDefinition.insertWithCamera(briefcaseDb, IModelDb.dictionaryId, 'default', modelSelectorId, categorySelectorId, displayStyleId, briefcaseDb.projectExtents);

      briefcaseDb.saveChanges();
      console.log(`[Test] Added default content (PhysicalModel: ${modelId})`);
    } finally {
      briefcaseDb.close();
    }

    // Set iModelId
    const nativeDb2 = IModelDb.openDgnDb({ path: tempFilePath }, OpenMode.ReadWrite);
    try {
      nativeDb2.setIModelId(iModelId);
      nativeDb2.saveChanges();
    } finally {
      nativeDb2.closeFile();
    }
    console.log(`[Test] Baseline file created at: ${tempFilePath}`);

    // Verify original file supports graphical editing
    console.log(`\n[Test] === Verifying ORIGINAL file ===`);
    const originalDb = await BriefcaseDb.open({ fileName: tempFilePath });
    let originalSupported = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nativeDb3 = (originalDb as any)[Symbol.for('nativeDb_core-backend_INTERNAL_ONLY_DO_NOT_USE')];
      originalSupported = nativeDb3?.isGeometricModelTrackingSupported?.() ?? false;
      console.log(`[Test] Original file isGeometricModelTrackingSupported: ${originalSupported}`);
    } finally {
      originalDb.close();
    }

    // Step 2: Upload to Azurite using CloudSqlite
    console.log(`\n[Test] === Step 2: Uploading to Azurite via CloudSqlite ===`);
    const containerId = iModelId;
    const dbName = 'baseline.bim';

    // Create container in Azurite
    const credential = new StorageSharedKeyCredential(AZURITE_ACCOUNT, AZURITE_KEY);
    const blobClient = new BlobServiceClient(AZURITE_URL, credential);
    const containerClient = blobClient.getContainerClient(containerId);

    const exists = await containerClient.exists();
    if (exists) {
      await containerClient.delete();
      console.log(`[Test] Deleted existing container: ${containerId}`);
    }
    await containerClient.create();
    console.log(`[Test] Created container: ${containerId}`);

    // Generate SAS token
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.valueOf() + 30 * 24 * 60 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const { ContainerSASPermissions } = await import('@azure/storage-blob');
    const permissions = ContainerSASPermissions.parse('racwdl');
    const sasUrl = await containerClient.generateSasUrl({ permissions, startsOn, expiresOn });
    const sasToken = sasUrl.split('?')[1] ?? '';

    // Create CloudSqlite container and upload
    const cacheName = `TestUpload_${iModelId}_${Date.now()}`;
    const cacheDir = path.join(tempDir, 'cloudsqlite-cache', cacheName);
    await fs.mkdir(cacheDir, { recursive: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cache: any | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let container: any | undefined;

    try {
      container = CloudSqlite.createCloudContainer({
        baseUri: AZURITE_URL,
        containerId,
        storageType: 'azure',
        accessToken: sasToken,
        writeable: true,
      });

      cache = CloudSqlite.CloudCaches.getCache({ cacheName, cacheDir, cacheSize: '1G' });
      container.initializeContainer({ blockSize: 4 * 1024 * 1024 });
      container.connect(cache);

      try {
        await CloudSqlite.withWriteLock({ user: 'test', container }, async () => {
          await CloudSqlite.uploadDb(container!, { dbName, localFileName: tempFilePath });
        });
        console.log(`[Test] Uploaded to CloudSqlite container`);
      } finally {
        container.disconnect({ detach: true });
      }
    } finally {
      if (cache) {
        CloudSqlite.CloudCaches.dropCache(cacheName)?.destroy();
      }
      await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {});
    }

    // Step 3: Download via BriefcaseManager
    console.log(`\n[Test] === Step 3: Downloading via BriefcaseManager ===`);

    // Set up hub access for download
    const azureStorage = new AzureClientStorage(new BlockBlobClientWrapperFactory());
    const iModelClient = new IModelsClient({
      api: { baseUrl: `${IMODELHUB_URL}/imodels` },
      cloudStorage: azureStorage,
    });
    const hubAccess = new BackendIModelsAccess(iModelClient);
    // hubAccess is configured in IModelHost.startup options

    const downloadProps = await BriefcaseManager.downloadBriefcase({ iTwinId, iModelId });
    console.log(`[Test] Downloaded to: ${downloadProps.fileName}`);
    console.log(`[Test] BriefcaseId: ${downloadProps.briefcaseId}`);

    // Step 4: Verify downloaded file
    console.log(`\n[Test] === Step 4: Verifying DOWNLOADED file ===`);
    const downloadedDb = await BriefcaseDb.open({ fileName: downloadProps.fileName });
    let downloadedSupported = false;
    try {
      console.log(`[Test] Downloaded file iModelId: ${downloadedDb.iModelId}`);
      console.log(`[Test] Downloaded file iTwinId: ${downloadedDb.iTwinId}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nativeDb4 = (downloadedDb as any)[Symbol.for('nativeDb_core-backend_INTERNAL_ONLY_DO_NOT_USE')];
      if (nativeDb4) {
        downloadedSupported = nativeDb4.isGeometricModelTrackingSupported?.() ?? false;
        console.log(`[Test] Downloaded file isGeometricModelTrackingSupported: ${downloadedSupported}`);

        const result = nativeDb4.setGeometricModelTrackingEnabled?.(true);
        console.log(`[Test] Downloaded file setGeometricModelTrackingEnabled(true):`, result);
      }

      // Query GeometricModels
      let modelCount = 0;
      for await (const row of downloadedDb.createQueryReader('SELECT ECInstanceId FROM bis.GeometricModel')) {
        console.log(`[Test] Downloaded file GeometricModel: id=${row[0]}`);
        modelCount++;
      }
      console.log(`[Test] Downloaded file total GeometricModels: ${modelCount}`);
    } finally {
      downloadedDb.close();
    }

    // Final result
    console.log(`\n[Test] === RESULT ===`);
    console.log(`[Test] Original file supports graphical editing: ${originalSupported}`);
    console.log(`[Test] Downloaded file supports graphical editing: ${downloadedSupported}`);

    if (originalSupported && downloadedSupported) {
      console.log(`[Test] ✅ PASS: Downloaded file supports graphical editing`);
    } else if (!originalSupported) {
      console.log(`[Test] ❌ FAIL: Original file does NOT support graphical editing`);
    } else {
      console.log(`[Test] ❌ FAIL: Downloaded file does NOT support graphical editing (was corrupted during download/upload)`);
    }

  } finally {
    // Cleanup
    await IModelHost.shutdown();
    await fs.unlink(tempFilePath).catch(() => {});
    console.log(`\n[Test] Cleanup completed`);
  }
}

testDownloadedBaseline().catch(console.error);
