/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Editing
 */


import { BentleyStatus, CompressedId64Set, DbOpcode, DbResult, Guid, Id64, Id64Arg, Id64String, IModelStatus } from "@itwin/core-bentley";
import { Matrix3d, Matrix3dProps, Point3d, Range3d, Range3dProps, Transform, TransformProps, Vector3d, XYZProps, YawPitchRollAngles } from "@itwin/core-geometry";
import { _nativeDb, BriefcaseDb, GeometricElement, GeometricElement3d, IModelDb, IpcHost } from "@itwin/core-backend";
import { BRepEntity, BRepGeometryInfo, BRepGeometryOperation, ColorDefProps, DynamicGraphicsRequest3dProps, EcefLocation, EcefLocationProps, ElementGeometry, ElementGeometryBuilderParams, ElementGeometryDataEntry, ElementGeometryFunction, ElementGeometryInfo, ElementGeometryOpcode, ElementGeometryRequest, FilePropertyProps, GeometricElement3dProps, GeometricElementProps, GeometryPartProps, IModelError, Placement3dProps } from "@itwin/core-common";
import { BasicManipulationCommandIpc, BlendEdgesProps, BooleanOperationProps, BRepEntityType, ChamferEdgesProps, ConnectedSubEntityProps, CutProps, DeleteSubEntityProps, EdgeParameterRangeProps, editorBuiltInCmdIds, ElementGeometryCacheFilter, ElementGeometryResultOptions, ElementGeometryResultProps, EmbossProps, EvaluatedEdgeProps, EvaluatedFaceProps, EvaluatedVertexProps, FaceParameterRangeProps, FlatBufferGeometryFilter, HollowFacesProps, ImprintProps, LocateSubEntityProps, LoftProps, OffsetEdgesProps, OffsetFacesProps, PointInsideResultProps, SewSheetProps, SolidModelingCommandIpc, SpinFacesProps, SubEntityAppearanceProps, SubEntityGeometryProps, SubEntityLocationProps, SubEntityProps, SubEntityType, SweepFacesProps, SweepPathProps, ThickenSheetProps, TransformSubEntityProps } from "@itwin/editor-common";
import { EditCommand } from "./EditCommand";

// ---------------------------------------------------------------------------
// Luban CAD D7 直改守卫挂钩（fork 修改，登记于 docs/ITWINJS_CORE_MODIFICATIONS.md §5）：
// 直改工具（变换/布尔/局部操作等）绕开特征系统改写 LubanCAD BodySolid 时，由注入方（鲁班 MS）
// 就地改写 props.jsonProperties 打 overridden 标记（随后 updateElement 一并落库），特征引擎见标
// 暂停再生。DI 形态仿 LubanCadSchema.bindFeatureEngine（依赖倒置：fork 不感知下游类名）。
// ---------------------------------------------------------------------------

/** 直改写点 op 标识（四写点：deleteElements/transformPlacement/rotatePlacement/updateGeometricElement）。 */
export type DirectEditOp = "deleteElements" | "transformPlacement" | "rotatePlacement" | "updateGeometricElement";

/** 直改守卫挂钩（由应用方注入；实现须为全函数——调用侧兜底吞错，守卫故障不得阻断直改工具）。 */
export interface DirectEditGuardHooks {
  /**
   * 直改写点回调。props 传入时就地改写其 jsonProperties（调用方随后的 updateElement 一并落库）；
   * 无 props（deleteElements 路径）时由实现自定语义。不得抛错。
   */
  onDirectEdit(iModel: IModelDb, elementId: Id64String, op: DirectEditOp, props?: GeometricElementProps): void;
}

let directEditGuard: DirectEditGuardHooks | undefined;

/** 注入/解绑（undefined）直改守卫。幂等。 */
export function bindDirectEditGuard(hooks: DirectEditGuardHooks | undefined): void { directEditGuard = hooks; }

/** 四写点统一调用入口：无挂钩 no-op；挂钩异常吞掉（隔离带故障不得阻断直改工具的可用性）。 */
function applyDirectEditGuard(iModel: IModelDb, elementId: Id64String, op: DirectEditOp, props?: GeometricElementProps): void {
  if (!directEditGuard)
    return;
  try {
    directEditGuard.onDirectEdit(iModel, elementId, op, props);
  } catch {
    // 吞错是有意裁决：守卫只打标记，直改工具的可用性不可因守卫故障而损（标记缺失可后补重新参数化）。
  }
}
/** Implementation for a EditCommand command that provides basic creation and modification operations.
 * @beta
 */
export class BasicManipulationCommand extends EditCommand implements BasicManipulationCommandIpc {
  public static override commandId = editorBuiltInCmdIds.cmdBasicManipulation;

  public constructor(iModel: IModelDb, protected _str: string) { super(iModel); }

  public override async onStart() { return BasicManipulationCommand.commandId; }

  public async addAllowedChannel(channelKey: string): Promise<void> {
    this.iModel.channels.addAllowedChannel(channelKey);
  }

  public async removeAllowedChannel(channelKey: string): Promise<void> {
    this.iModel.channels.removeAllowedChannel(channelKey);
  }

  public async deleteElements(ids: CompressedId64Set): Promise<IModelStatus> {
    const idSet = CompressedId64Set.decompressSet(ids);
    await this.iModel.locks.acquireLocks({ exclusive: idSet });
    this.beginEditing();

    for (const id of idSet) {
      applyDirectEditGuard(this.iModel, id, "deleteElements");
      this.txn.deleteElement(id);
    }

    return IModelStatus.Success;
  }

  public async transformPlacement(ids: CompressedId64Set, transProps: TransformProps): Promise<IModelStatus> {
    const idSet = CompressedId64Set.decompressSet(ids);
    await this.iModel.locks.acquireLocks({ exclusive: idSet });
    this.beginEditing();

    const transform = Transform.fromJSON(transProps);

    for (const id of idSet) {
      const element = this.iModel.elements.getElement<GeometricElement>(id);

      if (!element.placement.isValid)
        continue; // Ignore assembly parents w/o geometry, etc...

      element.placement.multiplyTransform(transform);
      const props = element.toJSON();
      applyDirectEditGuard(this.iModel, id, "transformPlacement", props);
      this.txn.updateElement(props);
    }

    return IModelStatus.Success;
  }

  public async rotatePlacement(ids: CompressedId64Set, matrixProps: Matrix3dProps, aboutCenter: boolean): Promise<IModelStatus> {
    const idSet = CompressedId64Set.decompressSet(ids);
    await this.iModel.locks.acquireLocks({ exclusive: idSet });
    this.beginEditing();

    const matrix = Matrix3d.fromJSON(matrixProps);

    for (const id of idSet) {
      const element = this.iModel.elements.getElement<GeometricElement>(id);

      if (!element.placement.isValid)
        continue; // Ignore assembly parents w/o geometry, etc...

      const fixedPoint = aboutCenter ? element.placement.calculateRange().center : Point3d.createFrom(element.placement.origin);
      const transform = Transform.createFixedPointAndMatrix(fixedPoint, matrix);

      element.placement.multiplyTransform(transform);
      const props = element.toJSON();
      applyDirectEditGuard(this.iModel, id, "rotatePlacement", props);
      this.txn.updateElement(props);
    }

    return IModelStatus.Success;
  }

  /** Mirror a geometric element across a world-space plane, in place (B4 Task 4).
   *
   * Keep-original semantics: the element's geometry becomes Unite(original, mirrored) — the
   * original material is retained inside the same element and the reflection is added, matching
   * the parametric mirror feature (keepOriginal:true).
   *
   * 【为何并集而非「镜像副本」】（B4 spike 实证）：单独镜像体是内翻体——BRep entry 的
   * entityTransform 带负行列式，网格有符号体积 −V、法向翻转；把该体单独写回元素会渲染
   * 内翻。内核在当前原生面没有「反转实体朝向」的暴露（AcisModify::ReverseOrientation
   * 仅片体门禁），而 **原体在前 Unite 镜像体**由 ACIS 归正（+2V、单 mesh）——参数化
   * mirror 求值器同款次序（见 AsyncFeatureEval.evaluateMirrorAsync 头注）。
   *
   * 坐标空间：反射平面由世界系转入元素**局部系**（Placement 仅刚体），源与镜像条目均
   * 留在局部系并集，元素 placement 不变——不引入世界坐标与恒等 placement 的混用。
   * v1 仅支持 BRep 实体几何；其它 displayable 条目（曲线/part 引用等）诚实拒收。
   */
  public async mirrorElement(elementId: Id64String, planePoint: XYZProps, planeNormal: XYZProps): Promise<Id64String> {
    const element = this.iModel.elements.getElement<GeometricElement3d>(elementId);
    // 注：不以 placement.isValid 作门——该谓词要求已计算 bbox，纯 placement 更新后为 null
    //（放置本身仍可逆）；无几何元素由 requestElementGeometry 空回包拒收，可逆性由 inverse 判。
    const worldPoint = Point3d.fromJSON(planePoint);
    const worldNormal = Vector3d.fromJSON(planeNormal);
    if (!worldNormal.normalizeInPlace())
      throw new IModelError(DbResult.BE_SQLITE_ERROR, "mirrorElement: degenerate plane normal");
    // 世界平面 → 元素局部系（placement 为刚体变换：点走全变换，方向只走旋转）。
    const worldToLocal = element.placement.transform.inverse();
    if (undefined === worldToLocal)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, `mirrorElement: element ${elementId} placement is not invertible`);
    const point = worldToLocal.multiplyPoint3d(worldPoint);
    const normal = worldToLocal.matrix.multiplyVector(worldNormal);
    if (!normal.normalizeInPlace())
      throw new IModelError(DbResult.BE_SQLITE_ERROR, "mirrorElement: degenerate plane normal in element space");
    // 反射矩阵 R = I − 2·n·nᵀ（负行列式）；平移 t = 2·(p·n)·n
    const reflection = Matrix3d.createIdentity();
    const c = [normal.x, normal.y, normal.z];
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++)
        reflection.setAt(row, col, (row === col ? 1 : 0) - 2 * c[row] * c[col]);
    const dot = point.x * normal.x + point.y * normal.y + point.z * normal.z;
    const mirror = Transform.createOriginAndMatrix(
      Point3d.create(2 * dot * normal.x, 2 * dot * normal.y, 2 * dot * normal.z),
      reflection,
    );
    const geometry = await this.requestElementGeometry(elementId);
    if (undefined === geometry || 0 === geometry.entryArray.length)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, `mirrorElement: element ${elementId} has no geometry`);
    const sourceGeometry: ElementGeometryDataEntry[] = [];
    const mirroredGeometry: ElementGeometryDataEntry[] = [];
    const passthrough: ElementGeometryDataEntry[] = [];
    for (const entry of geometry.entryArray) {
      if (ElementGeometryOpcode.BRep === entry.opcode) {
        const brep = ElementGeometry.toBRep(entry, true);
        if (!brep || !brep.data)
          throw new IModelError(DbResult.BE_SQLITE_ERROR, `mirrorElement: BRep entry without entity data on ${elementId}`);
        const base = undefined === brep.transform ? Transform.createIdentity() : Transform.fromJSON(brep.transform);
        const mirroredEntry = ElementGeometry.fromBRep({ ...brep, transform: mirror.multiplyTransformTransform(base).toJSON() });
        if (!mirroredEntry)
          throw new IModelError(DbResult.BE_SQLITE_ERROR, `mirrorElement: failed to encode mirrored BRep on ${elementId}`);
        sourceGeometry.push(entry);
        mirroredGeometry.push(mirroredEntry);
      } else if (ElementGeometry.isDisplayableEntry(entry)) {
        throw new IModelError(DbResult.BE_SQLITE_ERROR, `mirrorElement: only BRep solid geometry is supported (opcode=${entry.opcode})`);
      } else {
        passthrough.push(entry); // 外观/几何参数条目原样保留
      }
    }
    if (0 === mirroredGeometry.length)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, `mirrorElement: element ${elementId} has no BRep solid geometry`);
    // 并集次序钉死：原体在前（target）、镜像体在后——反序会使并集体整体内翻（spike 实证）。
    let unionEntries: ElementGeometryDataEntry[] | undefined;
    const status = this.iModel.createBRepGeometry({
      operation: BRepGeometryOperation.Unite,
      entryArray: [...sourceGeometry, ...mirroredGeometry],
      onResult: (info: BRepGeometryInfo) => { unionEntries = info.entryArray; },
    });
    if (status !== IModelStatus.Success || undefined === unionEntries || 0 === unionEntries.length)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, `mirrorElement: kernel Unite failed on ${elementId} (status=${status})`);
    const props = this.iModel.elements.getElementProps<GeometricElement3dProps>({ id: elementId });
    props.elementGeometryBuilderParams = { entryArray: [...passthrough, ...unionEntries] };
    await this.iModel.locks.acquireLocks({ exclusive: elementId });
    this.beginEditing();
    applyDirectEditGuard(this.iModel, elementId, "updateGeometricElement", props);
    this.txn.updateElement(props);
    return elementId;
  }

  public async insertGeometricElement(props: GeometricElementProps): Promise<Id64String> {
    await this.iModel.locks.acquireLocks({ shared: props.model });
    this.beginEditing();

    return this.txn.insertElement(props);
  }

  public async insertGeometryPart(props: GeometryPartProps): Promise<Id64String> {
    await this.iModel.locks.acquireLocks({ shared: props.model });
    this.beginEditing();

    return this.txn.insertElement(props);
  }

  public async updateGeometricElement(propsOrId: GeometricElementProps | Id64String, data?: ElementGeometryBuilderParams): Promise<void> {
    let props: GeometricElementProps;
    if (typeof propsOrId === "string") {
      if (undefined === data)
        throw new IModelError(DbResult.BE_SQLITE_ERROR, "Flatbuffer data required for update by id");
      props = this.iModel.elements.getElementProps<GeometricElementProps>(propsOrId);
    } else {
      props = propsOrId;
    }

    if (undefined === props.id)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, "Element id required for update");

    await this.iModel.locks.acquireLocks({ exclusive: props.id });
    this.beginEditing();

    if (undefined !== data)
      props.elementGeometryBuilderParams = { entryArray: data.entryArray, viewIndependent: data.viewIndependent };

    applyDirectEditGuard(this.iModel, props.id, "updateGeometricElement", props);
    this.txn.updateElement(props);
  }

  public async requestElementGeometry(elementId: Id64String, filter?: FlatBufferGeometryFilter): Promise<ElementGeometryInfo | undefined> {
    let accepted: ElementGeometryInfo | undefined;

    const onGeometry: ElementGeometryFunction = (info: ElementGeometryInfo): void => {
      accepted = info;

      if (undefined !== filter) {
        let numDisplayable = 0;

        for (const entry of info.entryArray) {
          if (!ElementGeometry.isDisplayableEntry(entry))
            continue;

          numDisplayable++;
          if (filter.maxDisplayable && numDisplayable > filter.maxDisplayable) {
            accepted = undefined;
            break;
          }

          if (filter.reject && filter.reject.some((opcode) => entry.opcode === opcode)) {
            accepted = undefined;
            break;
          }

          if (filter.accept && !filter.accept.some((opcode) => entry.opcode === opcode)) {
            accepted = undefined;
            break;
          }

          if (undefined === filter.geometry)
            continue;

          let entityType;
          if (filter.geometry.curves && !(filter.geometry.surfaces || filter.geometry.solids))
            entityType = ElementGeometry.isCurve(entry) ? BRepEntity.Type.Wire : undefined; // skip surface/solid opcodes...
          else
            entityType = ElementGeometry.getBRepEntityType(entry);

          switch (entityType) {
            case BRepEntity.Type.Wire:
              if (!filter.geometry.curves)
                accepted = undefined;
              break;
            case BRepEntity.Type.Sheet:
              if (!filter.geometry.surfaces)
                accepted = undefined;
              break;
            case BRepEntity.Type.Solid:
              if (!filter.geometry.solids)
                accepted = undefined;
              break;
            default:
              accepted = undefined;
              break;
          }

          if (undefined === accepted)
            break;
        }
      }
    };

    const requestProps: ElementGeometryRequest = {
      onGeometry,
      elementId,
    };

    if (IModelStatus.Success !== this.iModel.elementGeometryRequest(requestProps))
      return undefined;

    return accepted;
  }

  public async updateProjectExtents(extents: Range3dProps): Promise<void> {
    const newExtents = new Range3d();
    newExtents.setFromJSON(extents);

    if (newExtents.isNull)
      throw new IModelError(DbResult.BE_SQLITE_ERROR, "Invalid project extents");

    await this.iModel.acquireSchemaLock();
    this.beginEditing();
    this.txn.updateProjectExtents(newExtents);

    // Set source from calculated to user so connectors preserve the change.
    const unitsProps: FilePropertyProps = { name: "Units", namespace: "dgn_Db" };
    const unitsStr = this.iModel.queryFilePropertyString(unitsProps);
    if (undefined === unitsStr)
      return;

    const unitsVal = JSON.parse(unitsStr);
    const calculated = 1;
    if (calculated !== unitsVal.extentsSource) {
      unitsVal.extentsSource = calculated;
      this.txn.saveFileProperty(unitsProps, JSON.stringify(unitsVal));
    }
  }

  public async updateEcefLocation(ecefLocation: EcefLocationProps): Promise<void> {
    await this.iModel.acquireSchemaLock();
    this.beginEditing();

    // Clear GCS that caller already determined was invalid.
    this.txn.saveFileProperty({ name: "DgnGCS", namespace: "dgn_Db" }, undefined);
    this.txn.updateEcefLocation(ecefLocation);
  }
}

interface ElementGeometryCacheRequestProps {
  id?: Id64String;
}

interface ElementGeometryCacheResponseProps {
  status: BentleyStatus;
  numGeom?: number;
  numPart?: number;
  numSolid?: number;
  numSurface?: number;
  numCurve?: number;
  numOther?: number;
}

interface SubEntityGeometryResponseProps {
  /** The face, edge, or vertex geometry */
  geometry: ElementGeometryDataEntry;
  /** The face or edge range box for the sub-entity geometry stored as 6 values for low/high */
  range?: Float64Array;
  /** Category id for geometry. */
  category?: Id64String;
  /** SubCategory id for geometry. */
  subCategory?: Id64String;
  /** Material id for geometry. */
  material?: Id64String;
  /** color of geometry. */
  color?: ColorDefProps;
  /** transparency of geometry. */
  transparency?: number;
  /** weight of geometry. */
  weight?: number;
}

type GeometrySummaryFunction = (info: BRepEntityType[]) => void;
type SubEntityGeometryFunction = (info: SubEntityGeometryResponseProps) => void;
type SubEntityParameterRangeFunction = (info: FaceParameterRangeProps | EdgeParameterRangeProps) => void;
type SubEntityEvaluateFunction = (info: EvaluatedFaceProps | EvaluatedEdgeProps | EvaluatedVertexProps) => void;
type SubEntityArrayFunction = (info: SubEntityProps[]) => void;
type SubEntityLocationArrayFunction = (info: SubEntityLocationProps[]) => void;
type SubEntityLocationFunction = (info: SubEntityLocationProps) => void;
type PointInsideFunction = (info: PointInsideResultProps[]) => void;
type YesNoFunction = (info: boolean) => void;

interface GeometrySummaryRequestProps {
  /** Callback for result */
  onResult: GeometrySummaryFunction;
}

interface SubEntityGeometryRequestProps {
  /** Sub-entity to return geometry for */
  subEntity: SubEntityProps;
  /** Callback for result */
  onResult: SubEntityGeometryFunction;
}

interface SubEntityParameterRangeRequestProps {
  /** Sub-entity to query */
  subEntity: SubEntityProps;
  /** Callback for result */
  onResult: SubEntityParameterRangeFunction;
}

interface SubEntityEvaluateRequestProps {
  /** Sub-entity to query */
  subEntity: SubEntityProps;
  /** Face or edge u parameter to evaluate */
  uParam?: number;
  /** Face v parameter to evaluate */
  vParam?: number;
  /** Callback for result */
  onResult: SubEntityEvaluateFunction;
}

enum QuerySubEntity {
  /** Return whether the supplied face has a planar surface */
  PlanarFace = 0,
  /** Return whether the angle between the normals of the supplied edge's faces never exceeds the internal smooth angle tolerance along the length of the edge */
  SmoothEdge = 1,
  /** Return whether the supplied sub-entity is a laminar edge of a sheet body, i.e. boundary of a single face */
  LaminarEdge = 2,
  /** Return whether the supplied sub-entity is a linear edge */
  LinearEdge = 3,
  /** Return whether the angle between the normals of the supplied vertices's edges never exceeds the internal smooth angle tolerance along the length of the edge */
  SmoothVertex = 4,
  /** Return whether the supplied sub-entity is a redundant edge (containing faces share surface) */
  RedundantEdge = 5,
}

interface QuerySubEntityRequestProps {
  /** Sub-entity to test */
  subEntity: SubEntityProps;
  /** What to check */
  query: QuerySubEntity;
  /** Callback for result */
  onResult: YesNoFunction;
}

enum QueryBody {
  /** Return whether the geometric primitive index is a disjoint body */
  DisjointBody = 0,
  /** Return whether the geometric primitive index is a sheet body with a single planar face */
  SingleFacePlanarSheet = 1,
  /** Return whether the geometric primitive index is a sheet or solid entity that has all planar faces */
  OnlyPlanarFaces = 2,
  /** Return whether the geometric primitive index is a body with any edge that is non-linear or any face that is non-planar */
  CurvedFaceOrEdge = 3,
  /** Return whether the geometric primitive index is a planar sheet or wire body */
  PlanarBody = 4,
}

interface QueryBodyRequestProps {
  /** Geometric primitive index to test */
  index: number;
  /** What to check */
  query: QueryBody;
  /** Callback for result */
  onResult: YesNoFunction;
}

interface BodySubEntitiesRequestProps {
  /** What type of sub-entities to return, ex. faces of edge. */
  type: SubEntityType;
  /** Option to return only first sub-entity of each body instead of all sub-entities (native side accepts any boolean; undefined is rejected). */
  firstOnly?: boolean;
  /** Callback for result */
  onResult: SubEntityArrayFunction;
}

interface ConnectedSubEntityRequestProps {
  /** Sub-entity to return connected sub-entities for */
  subEntity: SubEntityProps;
  /** What type of connected sub-entities to return, ex. faces of edge. */
  type: SubEntityType;
  /** Options for returning connected edges and adjacent faces. */
  options?: ConnectedSubEntityProps;
  /** Callback for result */
  onResult: SubEntityArrayFunction;
}

interface LocateSubEntityRequestProps {
  /** Space point for boresite origin */
  point: XYZProps;
  /** Vector for boresite direction */
  direction: XYZProps;
  /** The maximum number of faces, edges, and vertices to return */
  options: LocateSubEntityProps;
  /** Callback for result */
  onResult: SubEntityLocationArrayFunction;
}

interface LocateFaceRequestProps {
  /** The face to return the ray intersection for */
  subEntity: SubEntityProps;
  /** Space point for boresite origin */
  point: XYZProps;
  /** Vector for boresite direction */
  direction: XYZProps;
  /** Callback for result */
  onResult: SubEntityLocationArrayFunction;
}

interface ClosestSubEntityRequestProps {
  /** Space point */
  point: XYZProps;
  /** Optional direction for choosing face from edge or vertex hit... */
  direction?: XYZProps;
  /** Callback for result */
  onResult: SubEntityLocationFunction;
}

interface ClosestPointRequestProps {
  /** Space point */
  point: XYZProps;
  /** The face or edge sub-entity to return closest point for */
  subEntity: SubEntityProps;
  /** Callback for result */
  onResult: SubEntityLocationFunction;
}

interface PointInsideRequestProps {
  /** Space point */
  point: XYZProps;
  /** Callback for result */
  onResult: PointInsideFunction;
}

/** @alpha */
export interface TopologyIdProps {
  /** Node (body) identifier of the persistent topology id */
  nodeId: number;
  /** Entity (face) identifier within the node */
  entityId: number;
}

interface SubEntityIdsResponseProps {
  /** Cache sub-entity ids of the matching sub-entities, decimal strings directly usable as SubEntityProps.id */
  subEntityIds: string[];
}

interface TopologyIdsResponseProps {
  /** Persistent topology id of every face, in traversal order */
  ids: TopologyIdProps[];
}

interface ValidateBodyResponseProps {
  /** Whether all bodies of the element pass the kernel consistency check */
  valid: boolean;
}

type TopologyIdFunction = (info: TopologyIdProps) => void;
type TopologyIdArrayFunction = (info: TopologyIdsResponseProps) => void;
type SubEntityIdsFunction = (info: SubEntityIdsResponseProps) => void;
type ValidateBodyFunction = (info: ValidateBodyResponseProps) => void;

interface TopologyIdFromSubEntityRequestProps {
  /** Cache sub-entity id of a face, decimal string form (as returned by BodySubEntities/FacesFromId) */
  subEntityId: string;
  /** Callback for result */
  onResult: TopologyIdFunction;
}

interface FacesFromIdRequestProps {
  /** Node identifier of the face to query */
  nodeId: number;
  /** Entity identifier of the face to query */
  entityId: number;
  /** Callback for result */
  onResult: SubEntityIdsFunction;
}

interface EdgesFromIdRequestProps {
  /** The two adjacent faces identifying the edge (exactly 2 entries, order-insensitive) */
  faceIds: TopologyIdProps[];
  /** Callback for result */
  onResult: SubEntityIdsFunction;
}

interface EdgesFromOwnIdRequestProps {
  /** Node identifier of the edge to query */
  nodeId: number;
  /** Entity identifier of the edge to query (the edge's OWN id, as returned by topologyIdFromSubEntity for an edge) */
  entityId: number;
  /** Callback for result */
  onResult: SubEntityIdsFunction;
}

interface AllTopologyIdsRequestProps {
  /** Callback for result */
  onResult: TopologyIdArrayFunction;
}

interface ValidateBodyRequestProps {
  /** Callback for result */
  onResult: ValidateBodyFunction;
}

enum OperationType {
  GeometrySummary = 0,
  SubEntityGeometry = 1,
  SubEntityParameterRange = 2,
  SubEntityEvaluate = 3,
  SubEntityQuery = 4,
  BodyQuery = 5,
  BodySubEntities = 6,
  ConnectedSubEntity = 7,
  LocateSubEntity = 8,
  LocateFace = 9,
  ClosestSubEntity = 10,
  ClosestFace = 11,
  ClosestPoint = 12,
  PointInside = 13,
  BooleanOp = 14,
  SewSheets = 15,
  ThickenSheets = 16,
  OffsetFaces = 17,
  OffsetEdges = 18,
  HollowFaces = 19,
  SweepFaces = 20,
  SpinFaces = 21,
  DeleteSubEntity = 22,
  TransformSubEntity = 23,
  Blend = 24,
  Chamfer = 25,
  Cut = 26,
  Emboss = 27,
  Imprint = 28,
  SweepPath = 29,
  Loft = 30,
  TopologyIdFromSubEntity = 31,
  FacesFromId = 32,
  EdgesFromId = 33,
  AllTopologyIds = 34,
  ValidateBody = 35,
  EdgesFromOwnId = 36,
}

interface ElementGeometryCacheOperationRequestProps {
  /** Target element id, tool element ids can be supplied by parameters... */
  id: Id64String;
  /** Requested operation */
  op: OperationType;
  /** Parameters for operation */
  params?: GeometrySummaryRequestProps | SubEntityGeometryRequestProps | SubEntityParameterRangeRequestProps | SubEntityEvaluateRequestProps | QuerySubEntityRequestProps | QueryBodyRequestProps | BodySubEntitiesRequestProps | ConnectedSubEntityRequestProps | LocateSubEntityRequestProps | LocateFaceRequestProps | ClosestSubEntityRequestProps | ClosestPointRequestProps | PointInsideRequestProps | TopologyIdFromSubEntityRequestProps | FacesFromIdRequestProps | EdgesFromIdRequestProps | EdgesFromOwnIdRequestProps | AllTopologyIdsRequestProps | ValidateBodyRequestProps | BooleanOperationProps | SewSheetProps | ThickenSheetProps | CutProps | EmbossProps | ImprintProps | SweepPathProps | LoftProps | OffsetFacesProps | OffsetEdgesProps | HollowFacesProps | SweepFacesProps | SpinFacesProps | DeleteSubEntityProps | TransformSubEntityProps | BlendEdgesProps | ChamferEdgesProps;
  /** Callback for result when element's geometry stream is requested in flatbuffer or graphic formats */
  onGeometry?: ElementGeometryFunction;
}

/** @alpha */
export class SolidModelingCommand extends BasicManipulationCommand implements SolidModelingCommandIpc {
  public static override commandId = editorBuiltInCmdIds.cmdSolidModeling;

  public override async onStart() { return SolidModelingCommand.commandId; }

  private async updateElementGeometryCache(props: ElementGeometryCacheRequestProps): Promise<ElementGeometryCacheResponseProps> {
    return this.iModel[_nativeDb].updateElementGeometryCache(props);
  }

  public async createElementGeometryCache(id: Id64String, filter?: ElementGeometryCacheFilter): Promise<boolean> {
    const result = await this.updateElementGeometryCache({ id });
    if (BentleyStatus.SUCCESS !== result.status)
      return false;

    if (undefined === filter)
      return true;

    if (filter.minGeom && (undefined === result.numGeom || filter.minGeom > result.numGeom))
      return false;

    if (filter.maxGeom && (undefined === result.numGeom || filter.maxGeom < result.numGeom))
      return false;

    if (!filter.parts && (result.numPart ?? 0 > 0))
      return false;

    if (!filter.curves && (result.numCurve ?? 0 > 0))
      return false;

    if (!filter.surfaces && (result.numSurface ?? 0 > 0))
      return false;

    if (!filter.solids && (result.numSolid ?? 0 > 0))
      return false;

    if (!filter.other && (result.numOther ?? 0 > 0))
      return false;

    return true;
  }

  public async clearElementGeometryCache(): Promise<void> {
    await this.updateElementGeometryCache({});
  }

  public async summarizeElementGeometryCache(id: Id64String): Promise<BRepEntityType[] | undefined> {
    let accepted: BRepEntityType[] | undefined;
    const onResult: GeometrySummaryFunction = (info: BRepEntityType[]): void => {
      accepted = info;
    };
    const params: GeometrySummaryRequestProps = { onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.GeometrySummary, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  private requestSubEntityGeometry(id: Id64String, subEntity: SubEntityProps): SubEntityGeometryResponseProps | undefined {
    let accepted: SubEntityGeometryResponseProps | undefined;
    const onResult: SubEntityGeometryFunction = (info: SubEntityGeometryResponseProps): void => {
      accepted = info;
    };
    const params: SubEntityGeometryRequestProps = { subEntity, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.SubEntityGeometry, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async getSubEntityGeometry(id: Id64String, subEntity: SubEntityProps, opts: Omit<ElementGeometryResultOptions, "writeChanges" | "insertProps">): Promise<SubEntityGeometryProps | undefined> {
    const geometryProps = this.requestSubEntityGeometry(id, subEntity);
    if (undefined === geometryProps?.geometry || undefined === geometryProps?.category)
      return undefined;

    const resultProps: SubEntityGeometryProps = {};

    if (opts.wantGeometry)
      resultProps.geometry = geometryProps.geometry;

    if (opts.wantRange)
      resultProps.range = (geometryProps?.range ? ElementGeometry.toElementAlignedBox3d(geometryProps?.range) : undefined);

    if (opts.wantAppearance) {
      const appearance: SubEntityAppearanceProps = { category: geometryProps.category };

      appearance.subCategory = geometryProps.subCategory;
      appearance.material = geometryProps.material;
      appearance.color = geometryProps.color;
      appearance.transparency = geometryProps.transparency;
      appearance.weight = geometryProps.weight;

      resultProps.appearance = appearance;
    }

    if (!opts.wantGraphic)
      return resultProps;

    const requestId = opts.requestId ? opts.requestId : `SubEntity:${id}-${subEntity.id}`;
    const toleranceLog10 = (opts.chordTolerance ? Math.floor(Math.log10(opts.chordTolerance)) : -2);

    const requestProps: DynamicGraphicsRequest3dProps = {
      id: requestId,
      modelId: this.iModel.iModelId,
      toleranceLog10,
      type: "3d",
      placement: { origin: Point3d.createZero(), angles: YawPitchRollAngles.createDegrees(0, 0, 0) },
      categoryId: geometryProps.category,
      elementId: id,
      geometry: { format: "flatbuffer", data: [geometryProps.geometry] },
    };

    resultProps.graphic = await this.iModel.generateElementGraphics(requestProps);

    return resultProps;
  }

  public async getSubEntityParameterRange(id: Id64String, subEntity: SubEntityProps): Promise<FaceParameterRangeProps | EdgeParameterRangeProps | undefined> {
    let accepted: FaceParameterRangeProps | EdgeParameterRangeProps | undefined;
    const onResult: SubEntityParameterRangeFunction = (info: FaceParameterRangeProps | EdgeParameterRangeProps): void => {
      accepted = info;
    };

    const params: SubEntityParameterRangeRequestProps = { subEntity, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.SubEntityParameterRange, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async evaluateSubEntity(id: Id64String, subEntity: SubEntityProps, uParam?: number, vParam?: number): Promise<EvaluatedFaceProps | EvaluatedEdgeProps | EvaluatedVertexProps | undefined> {
    let accepted: EvaluatedFaceProps | EvaluatedEdgeProps | EvaluatedVertexProps | undefined;
    const onResult: SubEntityEvaluateFunction = (info: EvaluatedFaceProps | EvaluatedEdgeProps | EvaluatedVertexProps): void => {
      accepted = info;
    };

    const params: SubEntityEvaluateRequestProps = { subEntity, uParam, vParam, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.SubEntityEvaluate, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  private async subEntityQuery(id: Id64String, subEntity: SubEntityProps, query: QuerySubEntity): Promise<boolean> {
    let accepted = false;
    const onResult: YesNoFunction = (info: boolean): void => {
      accepted = info;
    };

    const params: QuerySubEntityRequestProps = { subEntity, query, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.SubEntityQuery, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async isPlanarFace(id: Id64String, subEntity: SubEntityProps): Promise<boolean> {
    return this.subEntityQuery(id, subEntity, QuerySubEntity.PlanarFace);
  }

  public async isSmoothEdge(id: Id64String, subEntity: SubEntityProps): Promise<boolean> {
    return this.subEntityQuery(id, subEntity, QuerySubEntity.SmoothEdge);
  }

  public async isLaminarEdge(id: Id64String, subEntity: SubEntityProps): Promise<boolean> {
    return this.subEntityQuery(id, subEntity, QuerySubEntity.LaminarEdge);
  }

  public async isLinearEdge(id: Id64String, subEntity: SubEntityProps): Promise<boolean> {
    return this.subEntityQuery(id, subEntity, QuerySubEntity.LinearEdge);
  }

  public async isRedundantEdge(id: Id64String, subEntity: SubEntityProps): Promise<boolean> {
    return this.subEntityQuery(id, subEntity, QuerySubEntity.RedundantEdge);
  }

  public async isSmoothVertex(id: Id64String, subEntity: SubEntityProps): Promise<boolean> {
    return this.subEntityQuery(id, subEntity, QuerySubEntity.SmoothVertex);
  }

  private async bodyQuery(id: Id64String, index: number, query: QueryBody): Promise<boolean> {
    let accepted = false;
    const onResult: YesNoFunction = (info: boolean): void => {
      accepted = info;
    };

    const params: QueryBodyRequestProps = { index, query, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.BodyQuery, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async isDisjointBody(id: Id64String, index: number): Promise<boolean> {
    return this.bodyQuery(id, index, QueryBody.DisjointBody);
  }

  public async isPlanarBody(id: Id64String, index: number): Promise<boolean> {
    return this.bodyQuery(id, index, QueryBody.PlanarBody);
  }

  public async isSingleFacePlanarSheet(id: Id64String, index: number): Promise<boolean> {
    return this.bodyQuery(id, index, QueryBody.SingleFacePlanarSheet);
  }

  public async hasOnlyPlanarFaces(id: Id64String, index: number): Promise<boolean> {
    return this.bodyQuery(id, index, QueryBody.OnlyPlanarFaces);
  }

  public async hasCurvedFaceOrEdge(id: Id64String, index: number): Promise<boolean> {
    return this.bodyQuery(id, index, QueryBody.CurvedFaceOrEdge);
  }

  public async getBodySubEntities(id: Id64String, type: SubEntityType, firstOnly?: boolean): Promise<SubEntityProps[] | undefined> {
    let accepted: SubEntityProps[] | undefined;
    const onResult: SubEntityArrayFunction = (info: SubEntityProps[]): void => {
      accepted = info;
    };

    const params: BodySubEntitiesRequestProps = { type, firstOnly, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.BodySubEntities, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async getConnectedSubEntities(id: Id64String, subEntity: SubEntityProps, type: SubEntityType, options?: ConnectedSubEntityProps): Promise<SubEntityProps[] | undefined> {
    let accepted: SubEntityProps[] | undefined;
    const onResult: SubEntityArrayFunction = (info: SubEntityProps[]): void => {
      accepted = info;
    };

    const params: ConnectedSubEntityRequestProps = { subEntity, type, options, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.ConnectedSubEntity, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async locateSubEntities(id: Id64String, point: XYZProps, direction: XYZProps, options: LocateSubEntityProps): Promise<SubEntityLocationProps[] | undefined> {
    let accepted: SubEntityLocationProps[] | undefined;
    const onResult: SubEntityLocationArrayFunction = (info: SubEntityLocationProps[]): void => {
      accepted = info;
    };
    const params: LocateSubEntityRequestProps = { point, direction, options, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.LocateSubEntity, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async locateFace(id: Id64String, subEntity: SubEntityProps, point: XYZProps, direction: XYZProps): Promise<SubEntityLocationProps[] | undefined> {
    let accepted: SubEntityLocationProps[] | undefined;
    const onResult: SubEntityLocationArrayFunction = (info: SubEntityLocationProps[]): void => {
      accepted = info;
    };
    const params: LocateFaceRequestProps = { subEntity, point, direction, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.LocateFace, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async getClosestSubEntity(id: Id64String, point: XYZProps): Promise<SubEntityLocationProps | undefined> {
    let accepted: SubEntityLocationProps | undefined;
    const onResult: SubEntityLocationFunction = (info: SubEntityLocationProps): void => {
      accepted = info;
    };
    const params: ClosestSubEntityRequestProps = { point, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.ClosestSubEntity, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async getClosestFace(id: Id64String, point: XYZProps, direction?: XYZProps): Promise<SubEntityLocationProps | undefined> {
    let accepted: SubEntityLocationProps | undefined;
    const onResult: SubEntityLocationFunction = (info: SubEntityLocationProps): void => {
      accepted = info;
    };
    const params: ClosestSubEntityRequestProps = { point, direction, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.ClosestFace, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async getClosestPoint(id: Id64String, subEntity: SubEntityProps, point: XYZProps): Promise<SubEntityLocationProps | undefined> {
    let accepted: SubEntityLocationProps | undefined;
    const onResult: SubEntityLocationFunction = (info: SubEntityLocationProps): void => {
      accepted = info;
    };
    const params: ClosestPointRequestProps = { subEntity, point, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.ClosestPoint, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  public async isPointInside(id: Id64String, point: XYZProps): Promise<PointInsideResultProps[] | undefined> {
    let accepted: PointInsideResultProps[] | undefined;
    const onResult: PointInsideFunction = (info: PointInsideResultProps[]): void => {
      accepted = info;
    };
    const params: PointInsideRequestProps = { point, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.PointInside, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  private async getElementGeometryResults(id: Id64String, info: ElementGeometryInfo, opts: ElementGeometryResultOptions, tools?: Id64Arg): Promise<ElementGeometryResultProps | undefined> {
    if (0 === info.entryArray.length || undefined === info.categoryId || undefined === info.bbox)
      return undefined;

    const resultProps: ElementGeometryResultProps = {};

    if (opts.wantGeometry)
      resultProps.geometry = info;

    if (opts.wantRange)
      resultProps.range = ElementGeometry.toElementAlignedBox3d(info.bbox);

    if (opts.wantAppearance)
      resultProps.categoryId = info.categoryId;

    if (!(opts.wantGraphic || opts.writeChanges))
      return resultProps;

    let placement: Placement3dProps;
    const sourceToWorld = (undefined === info?.sourceToWorld ? undefined : ElementGeometry.toTransform(info.sourceToWorld));
    if (undefined === sourceToWorld) {
      placement = { origin: Point3d.createZero(), angles: YawPitchRollAngles.createDegrees(0, 0, 0) };
    } else {
      const origin = sourceToWorld.getOrigin();
      const angles = new YawPitchRollAngles();
      YawPitchRollAngles.createFromMatrix3d(sourceToWorld.matrix, angles);
      placement = { origin, angles };
    }

    if (opts.writeChanges) {
      if (undefined !== tools) {
        if (opts.insertProps) {
          // NOTE: Insert model may be different than tool model(s), can't rely on getting shared lock from them...
          await this.iModel.locks.acquireLocks({ shared: opts.insertProps.model, exclusive: tools });
        } else {
          await this.iModel.locks.acquireLocks({ exclusive: [id, ...tools] });
        }
      }

      if (opts.insertProps) {
        opts.insertProps.placement = placement; // entryArray is local to this placement...
        delete opts.insertProps.geom; // Ignore geometry if present...
        resultProps.elementId = await this.insertGeometricElement(opts.insertProps);
      } else {
        const updateProps = this.iModel.elements.getElementProps<GeometricElementProps>({ id });
        updateProps.category = info.categoryId; // allow category change...
        updateProps.placement = placement; // entryArray is local to this placement...
        await this.updateGeometricElement(updateProps, { entryArray: info.entryArray });
        resultProps.elementId = id;
      }

      if (undefined !== tools) {
        for (const toolId of Id64.iterable(tools))
          this.iModel.elements.deleteElement(toolId);
      }
    }

    if (!opts.wantGraphic)
      return resultProps;

    const requestId = opts.requestId ? opts.requestId : `EGCacheOp:${id}`;
    const toleranceLog10 = (opts.chordTolerance ? Math.floor(Math.log10(opts.chordTolerance)) : -2);

    const requestProps: DynamicGraphicsRequest3dProps = {
      id: requestId,
      modelId: this.iModel.iModelId,
      toleranceLog10,
      type: "3d",
      placement,
      categoryId: info.categoryId,
      elementId: id,
      geometry: { format: "flatbuffer", data: info.entryArray },
    };

    resultProps.graphic = await this.iModel.generateElementGraphics(requestProps);

    return resultProps;
  }

  private async doElementGeometryOperation(props: ElementGeometryCacheOperationRequestProps, opts: ElementGeometryResultOptions, tools?: Id64Arg): Promise<ElementGeometryResultProps | undefined> {
    let accepted: ElementGeometryInfo | undefined;
    const onGeometry: ElementGeometryFunction = (info: ElementGeometryInfo): void => {
      accepted = info;
    };

    props.onGeometry = onGeometry;
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);

    if (undefined === accepted)
      return undefined;

    return this.getElementGeometryResults(props.id, accepted, opts, tools);
  }

  public async booleanOperation(id: Id64String, params: BooleanOperationProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    // target insert = keep tools, target update = delete tools...
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.BooleanOp, params };
    return this.doElementGeometryOperation(props, opts, undefined === opts.insertProps ? params.tools : undefined);
  }

  public async sewSheets(id: Id64String, params: SewSheetProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    // target insert = keep tools, target update = delete tools...
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.SewSheets, params };
    return this.doElementGeometryOperation(props, opts, undefined === opts.insertProps ? params.tools : undefined);
  }

  public async thickenSheets(id: Id64String, params: ThickenSheetProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.ThickenSheets, params };
    return this.doElementGeometryOperation(props, opts);
  }

  public async cutSolid(id: Id64String, params: CutProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.Cut, params };
    return this.doElementGeometryOperation(props, opts, !params.keepProfile ? params.profile : undefined);
  }

  public async embossBody(id: Id64String, params: EmbossProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.Emboss, params };
    return this.doElementGeometryOperation(props, opts, !params.keepProfile ? params.profile : undefined);
  }

  public async imprintBody(id: Id64String, params: ImprintProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.Imprint, params };
    return this.doElementGeometryOperation(props, opts, !params.keepProfile && "string" === typeof (params.imprint) ? params.imprint : undefined);
  }

  public async sweepAlongPath(id: Id64String, params: SweepPathProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.SweepPath, params };
    return this.doElementGeometryOperation(props, opts, !params.keepPath ? params.path : undefined);
  }

  public async loftProfiles(id: Id64String, params: LoftProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const toolIds = (opts.writeChanges && (!params.keepTools || !params.keepGuides)) ? new Set<Id64String>() : undefined;

    if (undefined !== toolIds) {
      if (!params.keepTools) {
        for (const toolId of Id64.iterable(params.tools))
          toolIds.add(toolId);
      }

      if (undefined !== params.guides && !params.keepGuides) {
        for (const guideId of Id64.iterable(params.guides))
          toolIds.add(guideId);
      }
    }

    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.Loft, params };
    return this.doElementGeometryOperation(props, opts, toolIds);
  }

  public async offsetFaces(id: Id64String, params: OffsetFacesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.OffsetFaces, params };
    return this.doElementGeometryOperation(props, opts);
  }

  public async offsetEdges(id: Id64String, params: OffsetEdgesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.OffsetEdges, params };
    return this.doElementGeometryOperation(props, opts);
  }

  public async hollowFaces(id: Id64String, params: HollowFacesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.HollowFaces, params };
    return this.doElementGeometryOperation(props, opts);
  }

  public async sweepFaces(id: Id64String, params: SweepFacesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.SweepFaces, params };
    return this.doElementGeometryOperation(props, opts);
  }

  public async spinFaces(id: Id64String, params: SpinFacesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.SpinFaces, params };
    return this.doElementGeometryOperation(props, opts);
  }

  public async deleteSubEntities(id: Id64String, params: DeleteSubEntityProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.DeleteSubEntity, params };
    return this.doElementGeometryOperation(props, opts);
  }

  public async transformSubEntities(id: Id64String, params: TransformSubEntityProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.TransformSubEntity, params };
    return this.doElementGeometryOperation(props, opts);
  }

  public async blendEdges(id: Id64String, params: BlendEdgesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.Blend, params };
    return this.doElementGeometryOperation(props, opts);
  }

  public async chamferEdges(id: Id64String, params: ChamferEdgesProps, opts: ElementGeometryResultOptions): Promise<ElementGeometryResultProps | undefined> {
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.Chamfer, params };
    return this.doElementGeometryOperation(props, opts);
  }

  /** Query the persistent topology id of a face or edge identified by its cache sub-entity id (decimal string).
   * For a face this is the face's (nodeId, entityId) assignment. For an edge (M6-d T1) this is the edge's
   * OWN persistent id — stamped at creation, inherited by split pieces — NOT the adjacent-face-pair EdgeId.
   * @returns The (nodeId, entityId) pair, or undefined if the operation failed (protocol error, not a face/edge, or the edge carries no own id).
   */
  public async topologyIdFromSubEntity(id: Id64String, subEntityId: string): Promise<TopologyIdProps | undefined> {
    let accepted: TopologyIdProps | undefined;
    const onResult: TopologyIdFunction = (info: TopologyIdProps): void => {
      accepted = info;
    };
    const params: TopologyIdFromSubEntityRequestProps = { subEntityId, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.TopologyIdFromSubEntity, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  /** Query the cache sub-entity ids of the face identified by the supplied persistent topology id.
   * @returns Decimal string ids directly usable as SubEntityProps.id, or undefined if no face matched.
   * Returns more than one id when the face has been split into multiple pieces.
   */
  public async facesFromId(id: Id64String, nodeId: number, entityId: number): Promise<string[] | undefined> {
    let accepted: string[] | undefined;
    const onResult: SubEntityIdsFunction = (info: SubEntityIdsResponseProps): void => {
      accepted = info.subEntityIds;
    };
    const params: FacesFromIdRequestProps = { nodeId, entityId, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.FacesFromId, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  /** Query the cache sub-entity ids of the edge shared by two adjacent faces.
   * @param faceIds The persistent topology ids of the two adjacent faces (exactly 2 entries, order-insensitive).
   * @returns Decimal string ids directly usable as SubEntityProps.id, or undefined if no edge was found.
   */
  public async edgesFromId(id: Id64String, faceIds: TopologyIdProps[]): Promise<string[] | undefined> {
    let accepted: string[] | undefined;
    const onResult: SubEntityIdsFunction = (info: SubEntityIdsResponseProps): void => {
      accepted = info.subEntityIds;
    };
    const params: EdgesFromIdRequestProps = { faceIds, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.EdgesFromId, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  /** Query the cache sub-entity ids of the edge carrying the supplied persistent edge id (M6-d T1, op 36).
   * The edge id is the edge's OWN id — as returned by topologyIdFromSubEntity for an edge sub-entity —
   * NOT the adjacent-face-pair EdgeId consumed by edgesFromId. A split edge's pieces all carry the same
   * own id, so all pieces are returned (set semantics).
   * @returns Decimal string ids directly usable as SubEntityProps.id, or undefined if no edge matched.
   */
  public async edgesFromOwnId(id: Id64String, nodeId: number, entityId: number): Promise<string[] | undefined> {
    let accepted: string[] | undefined;
    const onResult: SubEntityIdsFunction = (info: SubEntityIdsResponseProps): void => {
      accepted = info.subEntityIds;
    };
    const params: EdgesFromOwnIdRequestProps = { nodeId, entityId, onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.EdgesFromOwnId, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  /** Enumerate the persistent topology ids of all faces of the element (one entry per face, traversal order).
   * @returns The id entries, or undefined if the element has no cached bodies or no faces with ids.
   */
  public async allTopologyIds(id: Id64String): Promise<TopologyIdProps[] | undefined> {
    let accepted: TopologyIdProps[] | undefined;
    const onResult: TopologyIdArrayFunction = (info: TopologyIdsResponseProps): void => {
      accepted = info.ids;
    };
    const params: AllTopologyIdsRequestProps = { onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.AllTopologyIds, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }

  /** Check kernel validity (consistency of topology and geometry) of all bodies of the element.
   * @returns false is an answer, not a failure - true only when every body passes. Returns undefined on protocol failure.
   */
  public async validateBody(id: Id64String): Promise<boolean | undefined> {
    let accepted: boolean | undefined;
    const onResult: ValidateBodyFunction = (info: ValidateBodyResponseProps): void => {
      accepted = info.valid;
    };
    const params: ValidateBodyRequestProps = { onResult };
    const props: ElementGeometryCacheOperationRequestProps = { id, op: OperationType.ValidateBody, params };
    this.iModel[_nativeDb].elementGeometryCacheOperation(props);
    return accepted;
  }
}
