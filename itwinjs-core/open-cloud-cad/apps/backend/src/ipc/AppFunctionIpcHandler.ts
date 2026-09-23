/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Custom IpcHandler for app functions (openBriefcase, etc.)
 *
 * Overrides the default IpcHost behavior to handle the case where
 * a briefcase is already open with the same key (e.g., after page refresh).
 */

import { BriefcaseDb, IModelDb, IpcHandler } from '@itwin/core-backend';
import { ChangesetIndexAndId, IModelConnectionProps, ipcAppChannels, IpcAppFunctions, OpenBriefcaseProps, ReinstateTxnArgs, ReverseTxnArgs } from '@itwin/core-common';
import { logger } from '../utils/logger.js';
import { getNativeDb, getOpenDbs, hasPendingTxns } from '../utils/itwinInternals.js';

/**
 * Custom App Function IPC Handler
 *
 * Extends the default IpcHost behavior to close existing databases
 * before opening new ones, preventing "key already in use" errors
 * when the frontend refreshes while a briefcase is open.
 */
export class AppFunctionIpcHandler extends IpcHandler implements IpcAppFunctions {
  public get channelName(): string {
    return ipcAppChannels.functions;
  }

  /**
   * Open a briefcase, closing any existing one with the same key first.
   * This prevents "key already in use" errors after page refresh.
   */
  public async openBriefcase(args: OpenBriefcaseProps): Promise<IModelConnectionProps> {
    // Ensure key is always set and consistent with frontend
    // The frontend uses args.key ?? args.fileName, so we must use the same logic
    const key = args.key ?? args.fileName;

    // Create a new args object with the key set (since args.key may be readonly)
    const openArgs: OpenBriefcaseProps = { ...args, key };

    // Check if there's already a db with this key open
    const existingDb = IModelDb.tryFindByKey(key);
    if (existingDb) {
      logger.info(`Closing existing db with key: ${key}`);
      try {
        existingDb.close();
      } catch (err) {
        logger.warn(`Error closing existing db: ${err}`);
        // Continue anyway - try to open the new one
      }
    }

    // Also check by filename
    const existingByFilename = IModelDb.findByFilename(openArgs.fileName);
    if (existingByFilename && existingByFilename !== existingDb) {
      logger.info(`Closing existing db by filename: ${openArgs.fileName}`);
      try {
        existingByFilename.close();
      } catch (err) {
        logger.warn(`Error closing existing db by filename: ${err}`);
      }
    }

    // Now open the briefcase
    logger.info(`Opening briefcase: ${openArgs.fileName} with key: ${key}`);
    try {
      const db = await BriefcaseDb.open(openArgs);
      logger.info(`Successfully opened briefcase: ${db.name}, changeset: ${db.changeset?.id ?? 'none'}`);
      // Ensure the returned key matches what the frontend expects
      const result: IModelConnectionProps = { ...db.toJSON(), key };
      return result;
    } catch (err) {
      logger.error(`Failed to open briefcase: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  // Stub implementations for other required methods
  // These delegate to the default implementation or throw

  public async log(): Promise<void> { /* no-op */ }

  public async openCheckpoint(): Promise<IModelConnectionProps> {
    throw new Error('openCheckpoint not implemented');
  }

  public async openStandalone(): Promise<IModelConnectionProps> {
    throw new Error('openStandalone not implemented');
  }

  public async openSnapshot(): Promise<IModelConnectionProps> {
    throw new Error('openSnapshot not implemented');
  }

  public async closeIModel(key: string): Promise<void> {
    const db = IModelDb.tryFindByKey(key);
    if (db) {
      db.close();
    }
  }

  public async saveChanges(key: string, description?: string): Promise<void> {
    logger.info(`saveChanges called: key=${key}, description=${description}`);

    // List all open databases to debug key mismatch
    const openDbs = getOpenDbs();
    logger.info(`Open databases: ${openDbs ? Array.from(openDbs.keys()) : 'none'}`);

    const db = IModelDb.tryFindByKey(key);
    if (db?.isBriefcaseDb()) {
      logger.info(`Found BriefcaseDb: key=${db.key}`);
      logger.info(`isBriefcaseDb: ${db.isBriefcaseDb()}`);

      // Check for unsaved changes
      const nativeDb = getNativeDb(db);
      logger.info(`hasUnsavedChanges before save: ${nativeDb?.hasUnsavedChanges()}`);
      logger.info(`hasPendingTxns before save: ${nativeDb?.hasPendingTxns?.()}`);
      logger.info(`isUndoPossible: ${db.txns.isUndoPossible}`);
      logger.info(`getUndoString: ${db.txns.getUndoString()}`);

      // Query for most recent elements to verify insertion
      logger.info('Querying for recent elements...');
      let elementCount = 0;
      try {
        for await (const row of db.createQueryReader("SELECT ECInstanceId, ECClassId, LastMod FROM bis.GeometricElement3d ORDER BY LastMod DESC LIMIT 5")) {
          logger.info(`Recent element: id=${row[0]}, class=${row[1]}, lastMod=${row[2]}`);
          elementCount++;
        }
      } catch (e) {
        logger.info(`Query error: ${e}`);
      }
      logger.info(`Total elements found: ${elementCount}`);

      // Also try querying GeometricElement (base class) to catch all geometry
      let allGeomCount = 0;
      try {
        for await (const row of db.createQueryReader("SELECT ECInstanceId, ECClassId FROM bis.GeometricElement LIMIT 10")) {
          logger.info(`GeometricElement: id=${row[0]}, class=${row[1]}`);
          allGeomCount++;
        }
      } catch (e) {
        logger.info(`GeometricElement query error: ${e}`);
      }
      logger.info(`Total GeometricElement found: ${allGeomCount}`);

      // Check if element with specific IDs exist
      const testIds = ['0x10000000001', '0x20000000001', '0x1', '0x2'];
      for (const testId of testIds) {
        try {
          const el = db.elements.tryGetElement(testId);
          if (el) {
            logger.info(`Found element ${testId}: ${el.classFullName}`);
          }
        } catch {
          // ignore
        }
      }

      // Check transaction state
      logger.info('Checking transaction state...');
      try {
        const txnState = (nativeDb as unknown as { getTxnState?(): unknown })?.getTxnState?.();
        logger.info(`Transaction state: ${txnState}`);
      } catch (e) {
        logger.info(`Could not get txn state: ${e}`);
      }

      // Check temp.txn_Elements table for pending changes using withPreparedSqliteStatement
      logger.info('Checking temp.txn_Elements...');
      try {
        let txnElementCount = 0;
        db.withPreparedSqliteStatement("SELECT ElementId, ChangeType, ECClassId FROM temp.txn_Elements", (stmt) => {
          while (stmt.step() === 0) { // DbResult.BE_SQLITE_ROW = 0
            logger.info(`txn_Elements: id=${stmt.getValueId(0)}, type=${stmt.getValueInteger(1)}, classId=${stmt.getValueId(2)}`);
            txnElementCount++;
          }
        });
        logger.info(`Total txn_Elements: ${txnElementCount}`);
      } catch (e) {
        logger.info(`Could not query txn_Elements: ${e}`);
      }

      // Check if there's a current txn by querying the native db directly
      logger.info('Checking native txn info...');
      try {
        // Try to get current txn id
        const currTxnId = (nativeDb as unknown as { getCurrentTxnId?(): unknown })?.getCurrentTxnId?.();
        logger.info(`Current txn ID: ${currTxnId}`);
      } catch (e) {
        logger.info(`Could not get current txn ID: ${e}`);
      }

      // Check if EditCommand has active command with same iModel
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/naming-convention
        const { EditCommandAdmin } = await import('@itwin/editor-backend');
        logger.info('EditCommandAdmin imported successfully');
        const activeCmd = EditCommandAdmin.activeCommand;
        if (activeCmd) {
          logger.info(`Active EditCommand: ${activeCmd.ctor.commandId}`);
          logger.info(`EditCommand iModel key: ${activeCmd.iModel.key}`);
          logger.info(`Same iModel instance: ${activeCmd.iModel === db}`);
          const cmdNativeDb = getNativeDb(activeCmd.iModel);
          logger.info(`EditCommand iModel hasUnsavedChanges: ${cmdNativeDb?.hasUnsavedChanges()}`);
          logger.info(`EditCommand iModel hasPendingTxns: ${cmdNativeDb?.hasPendingTxns?.()}`);
          logger.info(`EditCommand isUndoPossible: ${(activeCmd.iModel as BriefcaseDb).txns?.isUndoPossible}`);
          logger.info(`EditCommand getUndoString: ${(activeCmd.iModel as BriefcaseDb).txns?.getUndoString()}`);

          // CRITICAL: Check if EditCommand iModel and db are actually the same nativeDb
          logger.info(`nativeDb === cmdNativeDb: ${nativeDb === cmdNativeDb}`);
        } else {
          logger.info('No active EditCommand');
        }
      } catch (err) {
        logger.info(`Error checking EditCommand: ${err}`);
      }

      // Set up one-time listener for onGeometryChanged
      // Use a promise to wait for the event before returning
      let geometryChangedResolve: (() => void) | undefined;
      const geometryChangedPromise = new Promise<void>((resolve) => {
        geometryChangedResolve = resolve;
      });

      const removeListener = db.txns.onGeometryChanged.addListener((changes) => {
        logger.info(`onGeometryChanged fired: ${JSON.stringify(changes)}`);
        // Notify that event fired
        if (geometryChangedResolve) {
          geometryChangedResolve();
          geometryChangedResolve = undefined;
        }
      });

      db.saveChanges(description);

      // Wait for onGeometryChanged event with timeout
      // The event should fire very quickly (synchronously or near-synchronously)
      try {
        await Promise.race([
          geometryChangedPromise,
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
        ]);
        logger.info('onGeometryChanged event received');
      } catch {
        // Timeout - event may not have fired (no geometry changes)
        logger.info('onGeometryChanged event timeout (no geometry changes or event already fired)');
      }

      // Remove listener after saveChanges and event handling
      removeListener();

      logger.info(`hasUnsavedChanges after save: ${nativeDb?.hasUnsavedChanges()}`);
      logger.info('saveChanges completed');
    } else {
      logger.info(`BriefcaseDb not found or not a briefcase for key: ${key}`);
    }
  }

  public async abandonChanges(key: string): Promise<void> {
    const db = IModelDb.tryFindByKey(key);
    if (db?.isBriefcaseDb()) {
      db.abandonChanges();
    }
  }

  public async hasPendingTxns(key: string): Promise<boolean> {
    const db = IModelDb.tryFindByKey(key);
    return db ? hasPendingTxns(db) : false;
  }

  public async isUndoPossible(key: string): Promise<boolean> {
    const db = IModelDb.tryFindByKey(key);
    return db?.isBriefcaseDb() ? db.txns.isUndoPossible : false;
  }

  public async isRedoPossible(key: string): Promise<boolean> {
    const db = IModelDb.tryFindByKey(key);
    return db?.isBriefcaseDb() ? db.txns.isRedoPossible : false;
  }

  public async getUndoString(key: string): Promise<string> {
    const db = IModelDb.tryFindByKey(key);
    return db?.isBriefcaseDb() ? db.txns.getUndoString() : '';
  }

  public async getRedoString(key: string): Promise<string> {
    const db = IModelDb.tryFindByKey(key);
    return db?.isBriefcaseDb() ? db.txns.getRedoString() : '';
  }

  public async pullChanges(): Promise<ChangesetIndexAndId> {
    throw new Error('pullChanges not implemented');
  }

  public async cancelPullChangesRequest(): Promise<void> { /* no-op */ }

  public async pushChanges(_key: string): Promise<ChangesetIndexAndId> {
    throw new Error('pushChanges not implemented');
  }

  public async cancelPushChangesRequest(): Promise<void> { /* no-op */ }

  public async cancelTileContentRequests(): Promise<void> { /* no-op */ }

  public async cancelElementGraphicsRequests(): Promise<void> { /* no-op */ }

  public async toggleGraphicalEditingScope(key: string, startSession: boolean): Promise<boolean> {
    logger.info(`toggleGraphicalEditingScope called: key=${key}, startSession=${startSession}`);
    logger.info(`Available databases: ${Array.from(getOpenDbs()?.keys() || [])}`);
    const db = IModelDb.tryFindByKey(key);
    if (!db?.isBriefcaseDb()) {
      logger.error(`Briefcase not found for key: ${key}`);
      throw new Error('Briefcase not found');
    }
    const nativeDb = getNativeDb(db);
    if (!nativeDb) {
      throw new Error('Native db not available');
    }

    // Check if geometric model tracking is supported
    const trackingSupported = (nativeDb as unknown as { isGeometricModelTrackingSupported?(): boolean })?.isGeometricModelTrackingSupported?.();
    logger.info(`isGeometricModelTrackingSupported: ${trackingSupported}`);

    // Check current state first
    const currentState = (nativeDb as unknown as { setGeometricModelTrackingEnabled?(enabled: boolean): any })?.setGeometricModelTrackingEnabled?.(false);
    logger.info(`Current tracking state: ${JSON.stringify(currentState)}`);

    // If we're starting a session and one already exists, disable it first
    // This handles page refresh where frontend reconnects but backend still has old session
    if (startSession && currentState?.result === true) {
      logger.info('Disabling existing tracking before enabling new one');
      (nativeDb as unknown as { setGeometricModelTrackingEnabled?(enabled: boolean): any })?.setGeometricModelTrackingEnabled?.(false);
    }

    const result = (nativeDb as unknown as { setGeometricModelTrackingEnabled?(enabled: boolean): any })?.setGeometricModelTrackingEnabled?.(startSession) ?? { result: false };
    logger.info(`setGeometricModelTrackingEnabled(${startSession}) result: ${JSON.stringify(result)}`);
    if (result.error) {
      throw new Error(`Failed to toggle editing scope: ${result.error.message}`);
    }
    return result.result ?? false;
  }

  public async isGraphicalEditingSupported(key: string): Promise<boolean> {
    const db = IModelDb.tryFindByKey(key);
    return db?.isBriefcaseDb() ? true : false;
  }

  public async reverseTxns(key: string, numOperations: number): Promise<any> {
    const db = IModelDb.tryFindByKey(key);
    if (db?.isBriefcaseDb()) {
      return db.txns.reverseTxns(numOperations);
    }
    // Return a simple error code equivalent
    return 1; // IModelStatus.BadArg equivalent
  }

  public async reverseAllTxn(key: string): Promise<any> {
    const db = IModelDb.tryFindByKey(key);
    if (db?.isBriefcaseDb()) {
      return db.txns.reverseAll();
    }
    return 1;
  }

  public async reinstateTxn(key: string): Promise<any> {
    const db = IModelDb.tryFindByKey(key);
    if (db?.isBriefcaseDb()) {
      return db.txns.reinstateTxn();
    }
    return 1;
  }

  public async reverseTxnsAsync(key: string, numOperations: number, args?: ReverseTxnArgs): Promise<void> {
    const db = IModelDb.tryFindByKey(key);
    if (db?.isBriefcaseDb()) {
      return db.txns.reverseTxnsAsync(numOperations, args);
    }
  }

  public async reverseAllTxnsAsync(key: string, args?: ReverseTxnArgs): Promise<void> {
    const db = IModelDb.tryFindByKey(key);
    if (db?.isBriefcaseDb()) {
      return db.txns.reverseAllTxnsAsync(args);
    }
  }

  public async reinstateTxnAsync(key: string, args?: ReinstateTxnArgs): Promise<void> {
    const db = IModelDb.tryFindByKey(key);
    if (db?.isBriefcaseDb()) {
      return db.txns.reinstateTxnAsync(args);
    }
  }

  public async restartTxnSession(key: string): Promise<void> {
    const db = IModelDb.tryFindByKey(key);
    if (db?.isBriefcaseDb()) {
      // The method is restartSession, not restartTxnSession
      db.txns.restartSession();
    }
  }

  public async queryConcurrency(pool: 'io' | 'cpu'): Promise<number> {
    // Return a reasonable default
    return pool === 'cpu' ? 4 : 8;
  }
}
