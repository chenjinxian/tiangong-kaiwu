// Task 6 预研探针（SDD 调查产物）：rollback mark 三方法的 TS 侧调用面 + 内容类/缓存重建定界。
//
// 定界结论（判别面，输出留痕 probe-t6-output.txt）：
//   异步缓存调用（clear-all=DropAppData / populate 重灌）与同会话已物化的内核状态存在确定性崩溃竞态
//   （0xC0000005，worker 线程弃置主线程物化的 ACIS 体，疑线程亲和）——**同步「内核状态物化」类 op
//   任一先行即各自独立毒化：op 读通道（op34/32/1，c6）与 createRollbackMark（c2）**；纯行级读写
//   （requestElementGeometry / EditTxn 行写，c5）不毒化；无任何内核 op 时 populate→clear→populate
//   正常（早期 c1 形态）。T3.8 操作律：异步缓存调用收敛在首个内核状态物化 op 之前。
//
// 臂（argv[2] 选其一，单进程单臂——崩臂进程终止，崩前输出已同步落 stdout）：
//   brep  持久化 BRep entry 元素（内核 Sweep 产物）：不 populate 直调 createRollbackMark（同步
//         EnsureCacheEntry 懒建,不崩）→ 行直写 → 异步 populate（Task 4 缺陷点,崩）。
//   red   populate → mark → 行直写（不重建缓存）→ rollbackTo：部署二进制作废口径实证（同形直写
//         不灭 mark → rolledBack:true）+ 回滚后 op 读通道可用性。
//   c1    populate → 行读 + op 读 + 行直写 → clear（含 op 读,毒化——崩）。
//   c2    mark（同步建缓存）→ clear（mark 毒化——崩）。
//   c3    populate → mark → 行直写 → clear → populate → rollback（mark 毒化——崩于 clear）。
//   c4    c3 + 回滚后再 clear→populate（行不动重建）。
//   c5    populate → 行直写 + 行读 → clear → populate + 行读（纯行级读写——不崩,判别对照）。
//   c6    populate → op 读（op34/32/1,无 mark 无行写）→ clear（op 读独立毒化——崩）。
//
// 运行（须在 modeling-server 目录内跑——@itwin 依赖经 createRequire 锚定其 node_modules 解析）：
//   cd D:\Github\tiangong-kaiwu\modeling-server
//   npx tsx ..\.superpowers\sdd\2026-09-29-ws1-kernel-exposure\probe-t6\probe.mts c1

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// 裸包名解析锚定 modeling-server（link: 消费面与生产一致）；本文件在仓内固定深度：
// .superpowers/sdd/2026-09-29-ws1-kernel-exposure/probe-t6/ → 仓根 4 级之上。
const require2 = createRequire(pathToFileURL(path.resolve(import.meta.dirname, "../../../../modeling-server/package.json")));

const { IModelStatus, Id64String } = require2("@itwin/core-bentley");
const {
  BRepGeometryInfo, BRepGeometryOperation, Code, ElementGeometry, ElementGeometryDataEntry, IModel, RelatedElement,
} = require2("@itwin/core-common");
const { Box, LineSegment3d, LineString3d, Loop, Point3d, Vector3d } = require2("@itwin/core-geometry");
const {
  EditTxn, IModelHost, PhysicalModel, PhysicalPartition, SpatialCategory, StandaloneDb, SubjectOwnsPartitionElements, _nativeDb,
} = require2("@itwin/core-backend");
const { SolidModelingCommand } = require2("@itwin/editor-backend");

// 同步写 stdout：segfault 不丢已打行（证据顺序保真）。
const log = (s: string): void => {
  try { fs.writeSync(1, `[probe] ${s}\n`); } catch { /* 弃 */ }
};

function runKernel(db: StandaloneDb, operation: BRepGeometryOperation, entryArray: ElementGeometryDataEntry[]): ElementGeometryDataEntry[] {
  let out: ElementGeometryDataEntry[] | undefined;
  const status = db.createBRepGeometry({
    operation, entryArray,
    onResult: (info: BRepGeometryInfo) => { out = info.entryArray; },
  });
  if (status !== IModelStatus.Success || undefined === out || 0 === out.length)
    throw new Error(`内核 op 失败: op=${operation} status=${status}`);
  return out;
}

/** 持久化 BRep box（[0..w]×[0..2]×[0..1]，内核 Sweep 成体）——特征引擎同款产物。 */
function sweepBoxEntriesW(db: StandaloneDb, w: number): ElementGeometryDataEntry[] {
  const b = new ElementGeometry.Builder();
  b.appendGeometryQuery(Loop.create(LineString3d.create([
    Point3d.create(0, 0, 0), Point3d.create(w, 0, 0), Point3d.create(w, 2, 0), Point3d.create(0, 2, 0),
  ])));
  const profile = b.entries[0];
  b.entries.length = 0;
  b.appendGeometryQuery(LineSegment3d.create(Point3d.create(0, 0, 0), Point3d.create(0, 0, 1)));
  return runKernel(db, BRepGeometryOperation.Sweep, [profile, b.entries[0]]);
}

/** DgnBox 立方体 [0..s]³（等底顶尺寸,正交单位轴）——干净尺寸量标。 */
function cubeEntries(s: number): ElementGeometryDataEntry[] {
  const b = new ElementGeometry.Builder();
  const box = Box.createDgnBox(Point3d.create(0, 0, 0), Vector3d.unitX(), Vector3d.unitY(), Point3d.create(0, 0, s), s, s, s, s, true);
  if (undefined === box)
    throw new Error("Box.createDgnBox 返回 undefined（参数恒定，不可达）");
  b.appendGeometryQuery(box);
  return [...b.entries];
}

function insertEl(db: StandaloneDb, modelId: string, catId: string, label: string, entries: ElementGeometryDataEntry[]): Id64String {
  const t = new EditTxn(db, `ins-${label}`);
  t.start();
  const el = t.insertElement({
    classFullName: "Generic:PhysicalObject", model: modelId, category: catId, code: Code.createEmpty(),
    userLabel: label, elementGeometryBuilderParams: { entryArray: entries },
  } as never);
  t.end("save", `insert ${label}`);
  return el;
}

/** 直写换几何（行重写,不动缓存）——C++ RewriteRowBoxes 同款。 */
function rewriteRow(db: StandaloneDb, el: Id64String, entries: ElementGeometryDataEntry[]): void {
  const t = new EditTxn(db, "rewrite");
  t.start();
  const props = db.elements.getElementProps<Record<string, unknown>>(el);
  t.updateElement({ ...props, elementGeometryBuilderParams: { entryArray: entries } } as never);
  t.end("save", "rewrite row geometry");
  log("  rewriteRow saved");
}

async function populate(cmd: { createElementGeometryCache(id: string): Promise<boolean> }, el: Id64String): Promise<void> {
  const ok = await cmd.createElementGeometryCache(el);
  if (true !== ok)
    throw new Error("populate failed");
  log("  populate ok");
}

async function rebuild(cmd: { clearElementGeometryCache(): Promise<void>; createElementGeometryCache(id: string): Promise<boolean> }, el: Id64String): Promise<void> {
  log("  clear…");
  await cmd.clearElementGeometryCache();
  log("  cleared, populate…");
  await populate(cmd, el);
}

/** op 读通道量测：op34→nodeId、op32→面 id、op1→面 range（TS 层 getSubEntityGeometry wantRange）。 */
async function measure(cmd: { allTopologyIds(id: string): Promise<{ nodeId: number; entityId: number }[] | undefined>; facesFromId(id: string, n: number, e: number): Promise<string[] | undefined>; getSubEntityGeometry(id: string, sub: { type: number; id: number }, opts: { wantRange: true }): Promise<{ range?: unknown } | undefined> }, el: Id64String, tag: string): Promise<void> {
  const ids = await cmd.allTopologyIds(el);
  if (undefined === ids || 0 === ids.length) { log(`  [${tag}] op34 空 → 无体可量`); return; }
  const nodeId = ids[0].nodeId;
  const faces = await cmd.facesFromId(el, nodeId, 1);
  if (undefined === faces || 0 === faces.length) { log(`  [${tag}] op32 空`); return; }
  const g = await cmd.getSubEntityGeometry(el, { type: 0, id: Number(faces[0]) }, { wantRange: true });
  log(`  [${tag}] op34 n=${ids.length} nodeId=${nodeId} range=${JSON.stringify(g?.range)}`);
}

interface MarkNative {
  createRollbackMark(id: string): { markId: number };
  rollbackTo(id: string, m: number): { rolledBack: boolean };
  releaseMark(id: string, m: number): void;
}
const nativeOf = (db: StandaloneDb): MarkNative => (db as unknown as Record<symbol, unknown>)[_nativeDb] as unknown as MarkNative;

/** 行读通道（ROW,非缓存）：requestElementGeometry → 元素对齐 bbox 量测。 */
async function rowRead(cmd: { requestElementGeometry(id: string): Promise<{ bbox?: unknown } | undefined> }, el: Id64String, tag: string): Promise<void> {
  const info = await cmd.requestElementGeometry(el);
  log(`  [${tag}] row bbox=${JSON.stringify(info?.bbox)} entries=${info ? (info as { entryArray?: unknown[] }).entryArray?.length : "无info"}`);
}

async function armClear(scene: string): Promise<void> {
  log(`=== 定界臂 ${scene} ===`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-t6-clear-"));
  const db = StandaloneDb.createEmpty(path.join(dir, "p.bim"), { rootSubject: { name: "P" }, enableTransactions: true });

  const txn = new EditTxn(db, "setup");
  txn.start();
  const parent = new SubjectOwnsPartitionElements(IModel.rootSubjectId);
  const part = db.elements.createElement({ classFullName: PhysicalPartition.classFullName, model: IModel.repositoryModelId, parent, code: Code.createEmpty(), userLabel: "pp" });
  const partId = txn.insertElement(part.toJSON());
  const modelId = txn.insertModel(db.models.createModel({ classFullName: PhysicalModel.classFullName, modeledElement: new RelatedElement({ id: partId }) }).toJSON());
  const catId = txn.insertElement(SpatialCategory.create(db, IModel.dictionaryId, "probeCat").toJSON());
  txn.end("save", "trio");

  const el = insertEl(db, modelId, catId, "cube", cubeEntries(2));
  const cmd = new SolidModelingCommand(db, "probe-clear");
  const native = nativeOf(db);
  let mark = 0;

  if ("c6" === scene) {
    // c6：populate → op 读通道（op34/32/1,无 mark、无行写）→ clear —— 判别「op 读是否独立毒化」。
    await populate(cmd, el);
    await measure(cmd, el, "c6 基线(缓存,s2)");
    await rebuild(cmd, el);
    await measure(cmd, el, "c6 重建后(缓存,s2)");
  } else if ("c5" === scene) {
    // c5：populate → 行直写（EditTxn updateElement,无 op 读、无 mark）→ clear —— 判别「行级写是否毒化」。
    await populate(cmd, el);
    rewriteRow(db, el, cubeEntries(3));
    await rowRead(cmd, el, "c5 直写后(行,s3)");
    await rebuild(cmd, el);
    await rowRead(cmd, el, "c5 直写+重建(行,s3)");
  } else if ("red" === scene) {
    // RED 臂：直写（不重建缓存）→rollbackTo——部署二进制实现的是哪个作废口径？
    // + 回滚后 op34/32/1 读通道是否仍可用（最终测试的最大未知）。
    await populate(cmd, el);
    const m = native.createRollbackMark(el).markId;
    log(`  mark=${m}`);
    rewriteRow(db, el, cubeEntries(3));
    log(`  rollback(直写后)=${JSON.stringify(native.rollbackTo(el, m))}`);
    await measure(cmd, el, "red 回滚后(缓存读通道)");
    await rowRead(cmd, el, "red 回滚后(行)");
    native.releaseMark(el, m);
  } else if ("c1" === scene) {
    await populate(cmd, el);
    await rowRead(cmd, el, "c1 基线(行,s2)");
    await measure(cmd, el, "c1 基线(缓存,s2)");
    rewriteRow(db, el, cubeEntries(3));
    await rowRead(cmd, el, "c1 直写后(行,s3)");
    await rebuild(cmd, el);
    await rowRead(cmd, el, "c1 直写+重建(行,s3)");
    await measure(cmd, el, "c1 直写+重建(缓存,s3)");
  } else if ("c2" === scene) {
    mark = native.createRollbackMark(el).markId;
    log(`  mark=${mark}（同步建缓存）`);
    await rebuild(cmd, el);
    await measure(cmd, el, "c2 重建后");
  } else {
    await populate(cmd, el);
    mark = native.createRollbackMark(el).markId;
    log(`  mark=${mark}（条目已在,应无重建）`);
    rewriteRow(db, el, cubeEntries(3));
    await rebuild(cmd, el);
    await measure(cmd, el, `${scene} 直写+重建后(期望 s3)`);
    log(`  rollback=${JSON.stringify(native.rollbackTo(el, mark))}`);
    await measure(cmd, el, `${scene} 回滚后(期望 s2)`);
    if ("c4" === scene) {
      await rebuild(cmd, el);
      await measure(cmd, el, `${scene} 回滚后重建(期望 s3=行值)`);
      native.releaseMark(el, mark);
      log(`  release 后 rollback=${JSON.stringify(native.rollbackTo(el, mark))}`);
    }
  }

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  log(`=== 定界臂 ${scene} 完成（未崩）===`);
}

async function armBrep(): Promise<void> {
  log("=== 臂 brep：持久化 BRep entry（不 populate 直打标 + 异步 populate 是否仍崩）===");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-t6-brep-"));
  const db = StandaloneDb.createEmpty(path.join(dir, "p.bim"), { rootSubject: { name: "P" }, enableTransactions: true });

  const txn = new EditTxn(db, "setup");
  txn.start();
  const parent = new SubjectOwnsPartitionElements(IModel.rootSubjectId);
  const part = db.elements.createElement({ classFullName: PhysicalPartition.classFullName, model: IModel.repositoryModelId, parent, code: Code.createEmpty(), userLabel: "pp" });
  const partId = txn.insertElement(part.toJSON());
  const modelId = txn.insertModel(db.models.createModel({ classFullName: PhysicalModel.classFullName, modeledElement: new RelatedElement({ id: partId }) }).toJSON());
  const catId = txn.insertElement(SpatialCategory.create(db, IModel.dictionaryId, "probeCat").toJSON());
  txn.end("save", "trio");

  const cmd = new SolidModelingCommand(db, "probe-brep");
  const native = nativeOf(db);

  const el = insertEl(db, modelId, catId, "brepBox", sweepBoxEntriesW(db, 2));
  log(`element=${el}（持久化 BRep entry,未 populate）`);
  const mark = native.createRollbackMark(el).markId;   // ← 同步 EnsureCacheEntry → FindOrAddElement
  log(`mark=${JSON.stringify(mark)} → 未崩`);
  await measure(cmd, el, "brep w2 基线(mark 懒建缓存)");

  rewriteRow(db, el, sweepBoxEntriesW(db, 4));
  log("直写 w4 完成,开始异步 populate（Task 4 崩点）…");
  await populate(cmd, el);
  await measure(cmd, el, "brep w4 直写+populate 后");

  log(`rollback=${JSON.stringify(native.rollbackTo(el, mark))}`);
  await measure(cmd, el, "brep 回滚后");

  native.releaseMark(el, mark);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  log("=== 臂 brep 完成（未复现崩溃）===");
}

async function main(): Promise<void> {
  const arm = process.argv[2] ?? "c3";
  log(`node ${process.version}, tsx, arm=${arm}`);

  const h = IModelHost as unknown as { initialized?: boolean };
  if (!h.initialized)
    await IModelHost.startup({ profileName: "probe-t6" });

  if ("brep" === arm)
    await armBrep();
  else
    await armClear(arm);
}

main().then(() => process.exit(0)).catch((e) => { log(`JS error: ${e instanceof Error ? e.stack : String(e)}`); process.exit(1); });
