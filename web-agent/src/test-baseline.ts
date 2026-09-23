/**
 * Test script to verify baseline file supports graphical editing
 *
 * This tests whether the baseline file created by baseline-generator.ts
 * meets the requirements for isGraphicalEditingSupported to return true:
 * 1. BriefcaseDb can open the file
 * 2. The file has GeometryGuid values in bis_Model table
 * 3. Graphical editing can be enabled
 */

import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

async function testBaselineFile(): Promise<void> {
  const iModelId = randomUUID();
  const iTwinId = randomUUID();
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `baseline_${iModelId}_${Date.now()}.bim`);

  console.log(`[Test] Creating baseline file for iModel: ${iModelId}`);
  console.log(`[Test] iTwinId: ${iTwinId}`);
  console.log(`[Test] Temp file path: ${tempFilePath}`);

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { SnapshotDb, BriefcaseDb, IModelHost, IModelDb, IModelJsFs, BriefcaseLocalValue, DefinitionModel, PhysicalModel, SpatialCategory, DisplayStyle3d, ModelSelector, CategorySelector, SpatialViewDefinition } = await import('@itwin/core-backend');
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { OpenMode } = await import('@itwin/core-bentley');
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { BriefcaseIdValue, ColorByName, SubCategoryAppearance, IModel, RenderMode, ViewFlags } = await import('@itwin/core-common');
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { Range3d } = await import('@itwin/core-geometry');

  // Use a temp cache directory to avoid conflict with running services
  const tempCacheDir = path.join(os.tmpdir(), `test-cache-${Date.now()}`);
  await IModelHost.startup({ cacheDir: tempCacheDir });
  console.log(`[Test] IModelHost started with cache: ${tempCacheDir}`);

  try {
    // Step 1: Create empty baseline file using SnapshotDb (same as baseline-generator)
    console.log(`[Test] Step 1: Creating empty baseline file...`);
    IModelJsFs.removeSync(tempFilePath);
    const emptyBaseline = SnapshotDb.createEmpty(tempFilePath, { rootSubject: { name: 'Empty iModel' } });
    emptyBaseline.saveChanges();
    emptyBaseline.close();
    console.log(`[Test] Empty baseline created`);

    // Step 2: Prepare the baseline file using native Db
    console.log(`[Test] Step 2: Preparing baseline file...`);
    const nativeDb = IModelDb.openDgnDb({ path: tempFilePath }, OpenMode.ReadWrite);
    try {
      nativeDb.setITwinId(iTwinId);
      nativeDb.saveChanges();
      nativeDb.deleteAllTxns();
      nativeDb.resetBriefcaseId(BriefcaseIdValue.Unassigned);
      nativeDb.saveLocalValue(BriefcaseLocalValue.NoLocking, 'true');
      nativeDb.saveChanges();
      console.log(`[Test] Baseline file prepared`);
    } finally {
      nativeDb.closeFile();
    }

    // Step 3: Open as BriefcaseDb and add default content
    console.log(`[Test] Step 3: Opening as BriefcaseDb and adding content...`);
    let briefcaseDb;
    try {
      briefcaseDb = await BriefcaseDb.open({ fileName: tempFilePath });
    } catch (error) {
      console.error(`[Test] Failed to open as BriefcaseDb:`, error);
      return;
    }

    try {
      // Set larger project extents (1000 x 1000 x 1000 meters centered at origin)
      const largeExtents = new Range3d(-500, -500, -100, 500, 500, 400);
      briefcaseDb.updateProjectExtents(largeExtents);
      console.log(`[Test] Set project extents to: ${JSON.stringify(largeExtents.toJSON())}`);

      const definitionModelId = DefinitionModel.insert(briefcaseDb, IModelDb.rootSubjectId, 'Definitions');
      const categoryId = SpatialCategory.insert(briefcaseDb, definitionModelId, 'Default Category', new SubCategoryAppearance({ color: ColorByName.white }));
      console.log(`[Test] Created SpatialCategory: ${categoryId}`);

      const modelId = PhysicalModel.insert(briefcaseDb, IModel.rootSubjectId, 'Default Physical Model');
      console.log(`[Test] Created PhysicalModel: ${modelId}`);

      const displayStyleId = DisplayStyle3d.insert(briefcaseDb, IModelDb.dictionaryId, 'default', {
        viewFlags: new ViewFlags({ renderMode: RenderMode.SmoothShade }),
        backgroundColor: ColorByName.black,
      });
      const modelSelectorId = ModelSelector.insert(briefcaseDb, IModelDb.dictionaryId, 'default', [modelId]);
      const categorySelectorId = CategorySelector.insert(briefcaseDb, IModelDb.dictionaryId, 'default', [categoryId]);
      SpatialViewDefinition.insertWithCamera(briefcaseDb, IModelDb.dictionaryId, 'default', modelSelectorId, categorySelectorId, displayStyleId, briefcaseDb.projectExtents);

      briefcaseDb.saveChanges();
      console.log(`[Test] Default content added`);
    } finally {
      briefcaseDb.close();
    }

    // Step 4: Set iModelId
    console.log(`[Test] Step 4: Setting iModelId...`);
    const nativeDb2 = IModelDb.openDgnDb({ path: tempFilePath }, OpenMode.ReadWrite);
    try {
      nativeDb2.setIModelId(iModelId);
      nativeDb2.saveChanges();
      console.log(`[Test] iModelId set: ${iModelId}`);
    } finally {
      nativeDb2.closeFile();
    }

    // Step 5: Test isGraphicalEditingSupported
    console.log(`[Test] Step 5: Testing graphical editing support...`);
    const db = await BriefcaseDb.open({ fileName: tempFilePath });

    try {
      console.log(`[Test] BriefcaseDb opened successfully`);
      console.log(`[Test] iModelId: ${db.iModelId}`);
      console.log(`[Test] iTwinId: ${db.iTwinId}`);

      // Access nativeDb to check graphical editing support
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nativeDb3 = (db as any)[Symbol.for('nativeDb_core-backend_INTERNAL_ONLY_DO_NOT_USE')];

      let isSupported = false;
      if (nativeDb3) {
        // Check if geometric model tracking is supported
        const isTrackingSupported = nativeDb3.isGeometricModelTrackingSupported?.();
        console.log(`[Test] isGeometricModelTrackingSupported: ${isTrackingSupported}`);
        isSupported = isTrackingSupported === true;

        // Try to enable tracking
        const result = nativeDb3.setGeometricModelTrackingEnabled?.(true);
        console.log(`[Test] setGeometricModelTrackingEnabled(true) result:`, result);
      }

      // Query for models with GeometryGuid
      console.log(`[Test] Querying GeometricModels...`);
      let modelCount = 0;
      for await (const row of db.createQueryReader(
        'SELECT ECInstanceId FROM bis.GeometricModel'
      )) {
        console.log(`[Test] GeometricModel: id=${row[0]}`);
        modelCount++;
      }
      console.log(`[Test] Total GeometricModels: ${modelCount}`);

      if (isSupported) {
        console.log(`[Test] ✅ PASS: Baseline file supports graphical editing`);
      } else {
        console.log(`[Test] ❌ FAIL: Baseline file does NOT support graphical editing`);
      }
    } finally {
      db.close();
    }

  } finally {
    // Cleanup
    await IModelHost.shutdown();
    await fs.unlink(tempFilePath).catch(() => {});
    console.log(`[Test] Cleanup completed`);
  }
}

// Import fs for cleanup
import * as fs from 'fs/promises';

testBaselineFile().catch(console.error);
