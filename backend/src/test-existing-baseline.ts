/**
 * Test script to verify existing downloaded briefcase files support graphical editing
 */

import * as path from 'path';
import * as os from 'os';
import { readdir } from 'fs/promises';

async function testExistingBriefcases(): Promise<void> {
  const cacheDir = '/Users/xunzhang/Documents/GitHub/itwinjs-core/open-cloud-cad/apps/backend/briefcase-cache/imodels/';

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { BriefcaseDb, IModelHost } = await import('@itwin/core-backend');

  // Use temp cache dir to avoid conflicts
  const tempCacheDir = path.join(os.tmpdir(), `test-cache-${Date.now()}`);
  await IModelHost.startup({ cacheDir: tempCacheDir });
  console.log(`[Test] IModelHost started`);

  try {
    // Get all iModel directories
    const entries = await readdir(cacheDir, { withFileTypes: true });
    const iModelDirs = entries.filter(e => e.isDirectory()).map(e => e.name);

    console.log(`[Test] Found ${iModelDirs.length} iModel directories`);

    for (const iModelId of iModelDirs.slice(0, 5)) { // Test first 5
      const iModelDir = path.join(cacheDir, iModelId);
      const briefcaseDirs = await readdir(iModelDir, { withFileTypes: true });
      const bcDirs = briefcaseDirs.filter(e => e.isDirectory());

      if (bcDirs.length === 0) continue;

      const bcDir = path.join(iModelDir, bcDirs[0].name);
      const files = await readdir(bcDir);
      const bimFiles = files.filter(f => f.endsWith('.bim'));

      if (bimFiles.length === 0) continue;

      const bimPath = path.join(bcDir, bimFiles[0]);
      console.log(`\n[Test] === Testing: ${iModelId} ===`);
      console.log(`[Test] File: ${bimPath}`);

      try {
        const db = await BriefcaseDb.open({ fileName: bimPath });
        try {
          console.log(`[Test] briefcaseId: ${db.briefcaseId}`);
          console.log(`[Test] IsBriefcase (briefcaseId >= 2): ${db.briefcaseId >= 2}`);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nativeDb = (db as any)[Symbol.for('nativeDb_core-backend_INTERNAL_ONLY_DO_NOT_USE')];
          if (nativeDb) {
            const isSupported = nativeDb.isGeometricModelTrackingSupported?.() ?? false;
            console.log(`[Test] isGeometricModelTrackingSupported: ${isSupported}`);

            if (isSupported) {
              const result = nativeDb.setGeometricModelTrackingEnabled?.(true);
              console.log(`[Test] setGeometricModelTrackingEnabled(true):`, result);
            }

            // Query GeometricModels
            let modelCount = 0;
            for await (const row of db.createQueryReader('SELECT ECInstanceId FROM bis.GeometricModel')) {
              console.log(`[Test] GeometricModel: id=${row[0]}`);
              modelCount++;
            }
            console.log(`[Test] Total GeometricModels: ${modelCount}`);

            if (isSupported) {
              console.log(`[Test] ✅ PASS: Supports graphical editing`);
            } else {
              console.log(`[Test] ❌ FAIL: Does NOT support graphical editing`);
            }
          }
        } finally {
          db.close();
        }
      } catch (error) {
        console.error(`[Test] Error opening ${iModelId}:`, error);
      }
    }

  } finally {
    await IModelHost.shutdown();
    console.log(`\n[Test] Cleanup completed`);
  }
}

testExistingBriefcases().catch(console.error);
