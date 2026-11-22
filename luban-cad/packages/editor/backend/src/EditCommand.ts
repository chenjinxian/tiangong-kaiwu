/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */

import { IModelStatus } from "@itwin/core-bentley";
import { EditTxn, IModelDb, IpcHandler, IpcHost } from "@itwin/core-backend";
import { BackendError, IModelError, SaveChangesArgs } from "@itwin/core-common";
import { EditCommandIpc, EditorIpc, editorIpcStrings } from "@itwin/editor-common";

/** @beta */
export type EditCommandType = typeof EditCommand;

/**
 * Context for one direct-edit write call (G1 C3.3).
 *
 * `args` is opaque client input. Gates must never log or persist it: it can
 * contain geometry payloads and, in hardened deployments, credentials.
 * @beta
 */
export interface EditWriteContext {
  /** Registered command id (the tool/command being driven). */
  commandId: string;
  /** IPC method being called (e.g. `transformPlacement`, `booleanOperation`). */
  methodName: string;
  /** Backend key of the command's iModel. */
  iModelKey: string;
  /** Client-supplied arguments (never logged by the gate). */
  args: readonly unknown[];
}

/** Result of one attempted direct-edit write, fed to the audit hook. @beta */
export interface EditWriteOutcome {
  ok: boolean;
  /** Stable host error code/name when `ok` is false. */
  errorCode?: string;
}

/**
 * Server-side direct-edit write gate (G1 C3.3).
 *
 * The editor package classifies which IPC methods write (fail-closed: unknown
 * methods are writes) but deliberately knows nothing about sessions, document
 * ownership, leases or ACLs. A host installs this guard to require all of those
 * before the write method runs. `beforeWrite` throws to reject; `afterWrite` is
 * the audit hook and must not throw (the editor swallows its failures).
 * @beta
 */
export interface EditWriteGuard {
  beforeWrite(context: EditWriteContext): void | Promise<void>;
  afterWrite?(context: EditWriteContext, outcome: EditWriteOutcome): void;
}

/**
 * Methods that never modify persistent model state. Everything else is treated
 * as a write: keeping this as a *read-only* whitelist means a newly added write
 * method is gated by default (G1 C3.3).
 */
const NON_WRITING_METHODS = new Set<string>([
  // EditCommand IPC basics.
  "ping",
  // BasicManipulationCommand queries.
  "requestElementGeometry",
  // SolidModelingCommand element-geometry-cache queries (process-local cache,
  // not persistent model data).
  "createElementGeometryCache",
  "clearElementGeometryCache",
  "summarizeElementGeometryCache",
  "getSubEntityGeometry",
  "getSubEntityParameterRange",
  "evaluateSubEntity",
  "isPlanarFace",
  "isSmoothEdge",
  "isLaminarEdge",
  "isLinearEdge",
  "isRedundantEdge",
  "isSmoothVertex",
  "isDisjointBody",
  "isPlanarBody",
  "isSingleFacePlanarSheet",
  "hasOnlyPlanarFaces",
  "hasCurvedFaceOrEdge",
  "getBodySubEntities",
  "getConnectedSubEntities",
  "locateSubEntities",
  "locateFace",
  "getClosestSubEntity",
  "getClosestFace",
  "getClosestPoint",
  "isPointInside",
  "topologyIdFromSubEntity",
  "facesFromId",
  "edgesFromId",
  "edgesFromOwnId",
  "allTopologyIds",
  "validateBody",
  // Transaction lifecycle: these persist/revert work already gated at its
  // write entry, and remain protected by the host's key-ownership check.
  "saveChanges",
  "abandonChanges",
  "abandonEdits",
  "endEdits",
  "requestFinish",
  "onStart",
]);

/**
 * Solid-modeling geometry operations mutate the element only when the caller
 * sets `opts.writeChanges`. Without it they are preview/query calls.
 */
const WRITE_OPTIONAL_GEOMETRY_METHODS = new Set<string>([
  "booleanOperation",
  "sewSheets",
  "thickenSheets",
  "cutSolid",
  "embossBody",
  "imprintBody",
  "sweepAlongPath",
  "loftProfiles",
  "offsetFaces",
  "offsetEdges",
  "hollowFaces",
  "sweepFaces",
  "spinFaces",
  "deleteSubEntities",
  "transformSubEntities",
  "taperFaces",
  "blendEdges",
  "chamferEdges",
]);

function hasWriteChanges(args: readonly unknown[]): boolean {
  const last = args[args.length - 1];
  return undefined !== last
    && "object" === typeof last
    && (last as { writeChanges?: unknown }).writeChanges === true;
}

/**
 * Classify one `EditorIpc.callMethod` invocation as a direct-edit write.
 * Unknown methods are writes (fail closed).
 * @beta
 */
export function isEditWriteMethod(methodName: string, args: readonly unknown[]): boolean {
  if (WRITE_OPTIONAL_GEOMETRY_METHODS.has(methodName))
    return hasWriteChanges(args);
  return !NON_WRITING_METHODS.has(methodName);
}

/** Stable error code/name for audit; never includes the error message. */
function editWriteErrorCode(err: unknown): string | undefined {
  if (undefined === err || "object" !== typeof err)
    return undefined;
  const code = (err as { code?: unknown }).code;
  if ("string" === typeof code)
    return code;
  const name = (err as { name?: unknown }).name;
  return "string" === typeof name ? name : undefined;
}

/**
 * An EditCommand performs an editing action on the backend.
 * Any writes to the iModel in an editing session should be done from an EditCommand:
 * - All changes to an iModel are made within a transaction (Txn).
 * - Calling SaveChanges ends the current Txn and starts a new one.
 * - Using EditCommand ensures all of the changes in a Txn are from the same source, as only one EditCommand may be active at a time.
 * - Because there is currently no way to enforce this, it is important that all applications follow this rule.
 * EditCommands are usually paired with and driven by EditTools on the frontend that can either be interactive tools or immediate tools.
 * Interactive EditTools:
 * - Can be a [PrimitiveTool]($frontend).
 * - Can be an [InputCollector]($frontend) in special cases such as [EditManipulator.HandleTool]($frontend).
 * - Should not be a [ViewTool]($frontend), these should never write changes to the iModel.
 * Immediate EditTools:
 * - As direct subclasses of [Tool]($frontend) that perform their function without further input or becoming the active tool,
 * they potentially leave the current [PrimitiveTool]($frontend) in an invalid state.
 * - To avoid issues, immediate tools that start an EditCommand must call [ToolAdmin.restartPrimitiveTool]($frontend) when they complete.
 * EditCommands have a *commandId* that uniquely identifies them, so they can be found via a lookup in the [[EditCommandAdmin]].
 * Each EditCommand must be registered in the [[EditCommandAdmin]] with [[EditCommandAdmin.register]] or [[EditCommandAdmin.registerModule]].
 * Every time an EditCommand runs, a new instance of (a subclass of) this class is created.
 * @see [[BasicManipulationCommand]] for an example EditCommand.
 * @beta
 */

export class EditCommand implements EditCommandIpc {
  /** The unique string that identifies this EditCommand class. This must be overridden in every subclass. */
  public static commandId = "";
  public static version = "1.0.0";

  /** The iModel this EditCommand may modify. */
  public readonly iModel: IModelDb;

  /** The explicit editing transaction for this command. Subclasses use this to perform writes to the iModel. */
  protected readonly txn: EditTxn;

  /** Application-specific data included when this command commits its EditTxn. */
  protected appData?: SaveChangesArgs["appData"];

  public constructor(iModel: IModelDb, ..._args: any[]) {
    this.iModel = iModel;
    this.txn = new EditTxn(iModel, this.ctor.name);
  }
  public get ctor(): EditCommandType {
    return this.constructor as EditCommandType;
  }

  public async onStart(): Promise<any> { }

  /** Start this command's transaction if it has not already started. */
  protected beginEditing(): void {
    if (!this.txn.isActive)
      this.txn.start();
  }

  /** Returns true if this command's transaction is currently active. */
  public get isTxnActive(): boolean {
    return this.txn.isActive;
  }

  /** Abandon any pending changes and end this command's EditTxn */
  public async abandonEdits(): Promise<void> {
    if (this.txn.isActive)
      this.txn.end("abandon");
  }

  /** Save all pending edits and end this command's EditTxn */
  public async endEdits(description?: string): Promise<void> {
    if (this.txn.isActive)
      this.txn.end("save", this.resolveSaveChangesArg(description));
  }

  public async ping(): Promise<{ commandId: string, version: string, [propName: string]: any }> {
    return { version: this.ctor.version, commandId: this.ctor.commandId, iModelKey: this.iModel.key };
  }

  /** Save any pending changes on this command's EditTxn. Leaves the EditTxn active for further edits.
   * @param description Optional description saved with the changes.
   */
  public async saveChanges(description?: string): Promise<void> {
    if (this.txn.isActive)
      this.txn.saveChanges(this.resolveSaveChangesArg(description));
  }

  /** Abandon any pending changes on this command's EditTxn. Leaves the EditTxn active for further edits. */
  public async abandonChanges(): Promise<void> {
    if (this.txn.isActive)
      this.txn.abandonChanges();
  }

  /**
   * Called when another EditCommand wishes to become the active EditCommand.
   * The default implementation abandons pending edits (does not save changes) and returns "done".
   * Subclasses should complete and call end their work as soon as possible before returning "done".
   * If it is not currently possible to finish, return any string other than "done" and the other EditCommand will have to wait and retry,
   * potentially showing the returned string to the user.
   */
  public async requestFinish(): Promise<"done" | string> {  // eslint-disable-line @typescript-eslint/no-redundant-type-constituents
    await this.abandonEdits(); // by default, don't save changes. Subclasses must determine whether they are valid and save them themselves
    return "done";
  }

  private resolveSaveChangesArg(description?: string): SaveChangesArgs {
    return { description: description ?? this.ctor.name, source: this.ctor.commandId, appData: this.appData };
  }
}

/** @internal Exported so host applications can unit-test the IPC wrapper. */
export class EditorAppHandler extends IpcHandler implements EditorIpc {
  public get channelName() { return editorIpcStrings.channel; }

  public async startCommand(commandId: string, iModelKey: string, ...args: any[]) {
    const owner = EditCommandAdmin.ownerForRequest();
    await EditCommandAdmin.finishCommandFor(owner);
    if (commandId === "") // just kill this owner's active command, don't start another
      return;

    // Ownership is checked before any db lookup so a foreign key never becomes
    // a handle. Owner-scoped slots also mean this never finishes another
    // session's command. This is read-level access (a foreign writable owner is
    // still rejected); write leases are a separate gate.
    EditCommandAdmin.assertKeyAccess(iModelKey, false);

    const commandClass = EditCommandAdmin.commands.get(commandId);
    if (undefined === commandClass)
      throw new IModelError(IModelStatus.NotRegistered, `Command not registered [${commandId}]`);

    return EditCommandAdmin.runCommandFor(owner, new commandClass(IModelDb.findByKey(iModelKey), ...args));
  }

  public async callMethod(methodName: string, ...args: any[]) {
    const owner = EditCommandAdmin.ownerForRequest();
    const cmd = EditCommandAdmin.activeCommandFor(owner);
    if (!cmd)
      throw new IModelError(IModelStatus.NoActiveCommand, `No active command`, { methodName });

    const write = isEditWriteMethod(methodName, args);
    EditCommandAdmin.assertKeyAccess(cmd.iModel.key, write);

    const func = (cmd as any)[methodName];
    if (typeof func !== "function")
      throw new IModelError(IModelStatus.FunctionNotFound, `Method ${methodName} not found on ${cmd.ctor.commandId}`);

    if (!write)
      return func.call(cmd, ...args);

    // G1 C3.3: every direct-edit write passes this single gate before touching
    // the iModel. The guard throws to fail closed; audit is reported below.
    const context: EditWriteContext = { commandId: cmd.ctor.commandId, methodName, iModelKey: cmd.iModel.key, args };
    await EditCommandAdmin.beforeWrite(context);
    try {
      const result = await func.call(cmd, ...args);
      EditCommandAdmin.afterWrite(context, { ok: true });
      return result;
    } catch (err) {
      EditCommandAdmin.afterWrite(context, { ok: false, errorCode: editWriteErrorCode(err) });
      throw err;
    }
  }
}

/**
 * Resolves the owner key (typically a server session id) for the current IPC
 * dispatch and validates access to the command's target iModel.
 *
 * Host applications install this hook; the editor package itself never depends
 * on a session implementation. Without a provider, the legacy single global
 * slot is used for backward compatibility.
 * @beta
 */
export interface EditCommandOwnerProvider {
  /** Return the owner key for the current request. Throw to fail closed. */
  requireOwner(): string;
  /**
   * Verify that the current request may drive a command on `iModelKey`.
   * Host applications should reject keys owned by another session with a
   * stable error code (e.g. `DocumentLocked`).
   */
  assertKeyAccess?(iModelKey: string, write: boolean): void;
}

/**
 * EditCommandAdmin holds a mapping between commandIds and their corresponding [[EditCommand]] class. This provides the mechanism to
 * run EditCommands by commandId.
 * It also keeps track of the currently active EditCommand **per owner** (G1 C3).
 * One owner (a server session) starting or finishing a command can never affect
 * another owner's active command. When no owner provider is installed, every
 * caller maps to the legacy default slot, preserving the historical single
 * global command behavior.
 * @beta
 */
export class EditCommandAdmin {
  public static readonly commands = new Map<string, EditCommandType>();

  /** Owner key used when no [[EditCommandOwnerProvider]] is installed. */
  public static readonly defaultOwnerKey = "";

  private static _activeByOwner = new Map<string, EditCommand>();
  private static _ownerProvider?: EditCommandOwnerProvider;
  private static _writeGuard?: EditWriteGuard;
  private static _isInitialized = false;

  /**
   * Install (or remove, with `undefined`) the owner resolution hook used by the
   * editor IPC wrapper. Hosts wire this to their connection/session layer.
   */
  public static setOwnerProvider(provider: EditCommandOwnerProvider | undefined): void {
    this._ownerProvider = provider;
  }

  /** Resolve the owner key for the current request (fails closed if the provider throws). */
  public static ownerForRequest(): string {
    return this._ownerProvider ? this._ownerProvider.requireOwner() : this.defaultOwnerKey;
  }

  /** Legacy global slot (owner = [[defaultOwnerKey]]). */
  public static get activeCommand(): EditCommand | undefined {
    return this._activeByOwner.get(this.defaultOwnerKey);
  }

  /** Active command for one owner key (undefined when that owner has none). */
  public static activeCommandFor(ownerKey: string): EditCommand | undefined {
    return this._activeByOwner.get(ownerKey);
  }

  /** Verify a command target belongs to the current request's owner. */
  public static assertKeyAccess(iModelKey: string, write: boolean): void {
    this._ownerProvider?.assertKeyAccess?.(iModelKey, write);
  }

  /**
   * Install (or remove, with `undefined`) the direct-edit write gate. Hosts
   * wire this to sessions, document ownership, write leases and ACLs.
   */
  public static setWriteGuard(guard: EditWriteGuard | undefined): void {
    this._writeGuard = guard;
  }

  /** Run the installed write gate; a missing guard leaves legacy behavior. */
  public static async beforeWrite(context: EditWriteContext): Promise<void> {
    await this._writeGuard?.beforeWrite(context);
  }

  /** Audit hook. Never throws into the edit path. */
  public static afterWrite(context: EditWriteContext, outcome: EditWriteOutcome): void {
    try {
      this._writeGuard?.afterWrite?.(context, outcome);
    } catch {
      // Audit failures must not turn a completed (or already failed) edit into
      // a different error. Host sinks are responsible for their own logging.
    }
  }

  /** If this owner has an active command, wait for it to finish.
   * Other owners are never touched.
   * @throws BackendError if the command fails to finish.
   */
  public static async finishCommandFor(ownerKey: string): Promise<void> {
    const active = this._activeByOwner.get(ownerKey);
    if (active) {
      const finished = await active.requestFinish();
      if ("done" !== finished)
        throw new BackendError(IModelStatus.ServerTimeout, editorIpcStrings.commandBusy, finished);
    }
    this._activeByOwner.delete(ownerKey);
  }

  /** Finish the legacy default owner's active command (backward-compatible API). */
  public static async finishCommand(): Promise<void> {
    return this.finishCommandFor(this.defaultOwnerKey);
  }

  /** Start a command for one owner. Finishes only that owner's previous command.
   * @throws BackendError if the previous command for this owner fails to finish.
   */
  public static async runCommandFor(ownerKey: string, cmd: EditCommand): Promise<any> {
    this.assertKeyAccess(cmd.iModel.key, false);
    await this.finishCommandFor(ownerKey);
    this._activeByOwner.set(ownerKey, cmd);
    return cmd.onStart();
  }

  /** Start running the specified command in the legacy default slot.
   * @throws BackendError if the currently-active command fails to finish.
   */
  public static async runCommand(cmd: EditCommand): Promise<any> {
    return this.runCommandFor(this.defaultOwnerKey, cmd);
  }

  /**
   * Abandon one owner's active command (session close / disconnect). Pending
   * edits are abandoned, never saved; other owners are untouched.
   */
  public static async dropOwner(ownerKey: string): Promise<void> {
    const active = this._activeByOwner.get(ownerKey);
    if (!active)
      return;
    this._activeByOwner.delete(ownerKey);
    await active.abandonEdits();
  }

  /** @internal Test seam: forget all owners, the provider and the write guard. */
  public static resetForTest(): void {
    this._activeByOwner.clear();
    this._ownerProvider = undefined;
    this._writeGuard = undefined;
  }

  /**
   * Un-register a previously registered EditCommand class.
   * @param commandId the commandId of a previously registered EditCommand to unRegister.
   */
  public static unRegister(commandId: string) {
    this.commands.delete(commandId);
  }

  /**
   * Register an EditCommand class. This establishes a connection between the commandId of the class and the class itself.
   * @param commandType the subclass of Tool to register.
   */
  public static register(commandType: EditCommandType) {
    if (!this._isInitialized) {
      this._isInitialized = true;
      if (!IpcHost.isValid)
        throw new Error("Edit Commands require IpcHost");
      EditorAppHandler.register();
    }
    if (commandType.commandId.length !== 0)
      this.commands.set(commandType.commandId, commandType);
  }

  /**
   * Register all the EditCommand classes found in a module.
   * @param modelObj the module to search for subclasses of EditCommand.
   */
  public static registerModule(moduleObj: any) {
    let foundOne = false;
    for (const thisMember in moduleObj) {  // eslint-disable-line guard-for-in
      const thisCmd = moduleObj[thisMember];
      if (thisCmd.prototype instanceof EditCommand) {
        foundOne = true;
        this.register(thisCmd);
      }
    }
    if (!foundOne)
      throw new Error(`no EditCommands found - are you sure this is a module? Maybe you meant to call "register"?`);
  }
}
