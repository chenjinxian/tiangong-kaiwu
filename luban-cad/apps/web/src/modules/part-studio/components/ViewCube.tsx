/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Onshape 风格 ViewCube（2026-11-02 重做；live Onshape 采集基线 150×150）。
 * - 150×150 stage；~84px 白面圆角 cube；罗盘弧线 + 四向箭头；无圆环/角点；
 *   八个不可见角点命中区（hover 才出现淡点），面点击=标准视图，拖拽=旋转。
 * - 底部右侧无边框 mini-cube 触发器（18px 立方 + 4px 箭头），打开与 Onshape
 *   一致的紧凑相机/渲染菜单（等轴测/正二等轴测/正三轴测、图形首选项、
 *   缩放、透视、带边着色子菜单、消除隐藏边子菜单、高质量视图）。
 * - 菜单未实现项（命名视图/上一视图/法向草图开关/相切边/边界边/剖视）
 *   按用户裁决隐藏；完整渲染参数仍在右停靠 DisplaySettingsPanel。
 * - 纯 core-frontend + iTwinUI 图标，不引入 AppUI。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  StandardViewId,
  type ScreenViewport,
} from '@itwin/core-frontend';
import { Angle, Matrix3d, Vector3d } from '@itwin/core-geometry';
import { OnshapeIcon } from '../icons/onshape-icons.js';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';
import {
  ViewCubeCameraMenu,
  useViewCubeHistory,
} from './ViewCubeCameraMenu.js';
import {
  axisScreenDirections,
  cssMatrix3dFromRotation,
  frontFaceBottomLeft,
  ISO_DIRECTION,
  orbitDirection,
  projectCubeCorners,
  projectCubePoint,
  projectFaceLabels,
  viewRotationFromDirection,
} from '../internal/view-orientation.js';
import './ViewCube.css';

export interface ViewCubeProps {
  viewport?: ScreenViewport | null;
  displaySettings?: UseDisplaySettingsResult;
  /** v2026-11-05：打开 Onshape 式「图形首选项」左侧对话框（宿主渲染）。 */
  onOpenGraphicsPreferences?: () => void;
}

type FaceId = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';

/**
 * CSS 局部坐标 y 向下；cube 局部 +Z（正对屏）对应世界 +Z（Top），局部 -Y
 * 对应世界 +Y（Back）。标准 Front 视图看向 -Y 侧，故 Front 面位于视觉下方。
 */
/** Onshape live：cube 面边长 58px（ISO 轮廓约 82 CSS；Front 面约 58px）。 */
const CUBE_SIZE = 58;
const HALF_SIZE = CUBE_SIZE / 2;
/** 三色轴屏幕长度（Onshape ISO/Front 实测：X 最长、Z 次之、Y 最短）。 */
const AXIS_LENGTHS = { x: 60, y: 46, z: 56 } as const;
const AXIS_IDS = ['x', 'y', 'z'] as const;
/** Onshape live CSS 变量 --os-axis-*-color 的精确值。 */
const AXIS_COLORS = { x: '#cd0000', y: '#009400', z: '#0000d0' } as const;
/** 标准视图 eye 方向：六轴 + 等轴测（Home 箭头在标准视图隐藏）。 */
const STANDARD_VIEW_DIRECTIONS: readonly Vector3d[] = [
  Vector3d.create(1, 0, 0), Vector3d.create(-1, 0, 0),
  Vector3d.create(0, 1, 0), Vector3d.create(0, -1, 0),
  Vector3d.create(0, 0, 1), Vector3d.create(0, 0, -1),
  ISO_DIRECTION.normalize()!,
];

type Vec3 = readonly [number, number, number];

const FACES: readonly {
  id: FaceId;
  transform: string;
  viewId: StandardViewId;
  normal: Vec3;
}[] = [
  { id: 'top', transform: `translateZ(${HALF_SIZE}px)`, viewId: StandardViewId.Top, normal: [0, 0, 1] },
  { id: 'bottom', transform: `rotateY(180deg) translateZ(${HALF_SIZE}px)`, viewId: StandardViewId.Bottom, normal: [0, 0, -1] },
  { id: 'right', transform: `rotateY(90deg) translateZ(${HALF_SIZE}px)`, viewId: StandardViewId.Right, normal: [1, 0, 0] },
  { id: 'left', transform: `rotateY(-90deg) translateZ(${HALF_SIZE}px)`, viewId: StandardViewId.Left, normal: [-1, 0, 0] },
  { id: 'back', transform: `rotateX(90deg) translateZ(${HALF_SIZE}px)`, viewId: StandardViewId.Back, normal: [0, -1, 0] },
  { id: 'front', transform: `rotateX(-90deg) translateZ(${HALF_SIZE}px)`, viewId: StandardViewId.Front, normal: [0, 1, 0] },
];
const FACE_BY_ID = new Map(FACES.map((face) => [face.id, face]));

interface ScreenVertex {
  id: string;
  sx: -1 | 1;
  sy: -1 | 1;
  sz: -1 | 1;
  x: number;
  y: number;
  visibleFaces: FaceId[];
}
interface ScreenFace {
  id: FaceId;
  points: { x: number; y: number }[];
}
interface HiddenStrip {
  id: string;
  face: FaceId;
  a: { x: number; y: number };
  b: { x: number; y: number };
}
interface ScreenCube {
  vertices: ScreenVertex[];
  faces: ScreenFace[];
  hiddenStrips: HiddenStrip[];
}
type HitTarget =
  | { kind: 'face'; face: FaceId }
  | { kind: 'hidden'; face: FaceId; edgeId: string }
  | { kind: 'corner'; id: string; direction: Vec3 };

function distanceToSegment(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-6) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function pointInPolygon(px: number, py: number, points: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (((a.y > py) !== (b.y > py))
      && px < ((b.x - a.x) * (py - a.y)) / ((b.y - a.y) || 1e-9) + a.x)
      inside = !inside;
  }
  return inside;
}

/** 投影 cube；用于 Onshape 式面/隐藏面边带/角点命中区（纯屏幕空间，不依赖 CSS 3D 命中）。 */
function buildScreenCube(rotation: Matrix3d): ScreenCube {
  const center = 75;
  const vertices: ScreenVertex[] = [];
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const p = projectCubePoint(rotation, [sx * HALF_SIZE, sy * HALF_SIZE, sz * HALF_SIZE]);
        const visibleFaces: FaceId[] = [];
        if (projectCubePoint(rotation, [sx, 0, 0]).z > 0.05) visibleFaces.push(sx > 0 ? 'right' : 'left');
        if (projectCubePoint(rotation, [0, sy, 0]).z > 0.05) visibleFaces.push(sy > 0 ? 'front' : 'back');
        if (projectCubePoint(rotation, [0, 0, sz]).z > 0.05) visibleFaces.push(sz > 0 ? 'top' : 'bottom');
        const id = `${sx > 0 ? 'x+' : 'x-'}${sy > 0 ? 'y+' : 'y-'}${sz > 0 ? 'z+' : 'z-'}`;
        vertices.push({ id, sx, sy, sz, x: center + p.x, y: center + p.y, visibleFaces });
      }
    }
  }
  const visibleFaceIds = new Set<FaceId>();
  for (const face of FACES) {
    if (projectCubePoint(rotation, face.normal).z > 0.05) visibleFaceIds.add(face.id);
  }
  const faces: ScreenFace[] = [];
  for (const face of FACES) {
    if (!visibleFaceIds.has(face.id)) continue;
    const pts = vertices
      .filter((vertex) => vertex.visibleFaces.includes(face.id))
      .map((vertex) => ({ x: vertex.x, y: vertex.y }));
    if (pts.length < 3) continue;
    const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
    const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
    pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    faces.push({ id: face.id, points: pts });
  }
  const hiddenStrips: HiddenStrip[] = [];
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const a = vertices[i]!;
      const b = vertices[j]!;
      let differences = 0;
      if (a.sx !== b.sx) differences++;
      if (a.sy !== b.sy) differences++;
      if (a.sz !== b.sz) differences++;
      if (differences !== 1) continue;
      const adjacent: FaceId[] = [];
      if (a.sx === b.sx) adjacent.push(a.sx > 0 ? 'right' : 'left');
      if (a.sy === b.sy) adjacent.push(a.sy > 0 ? 'front' : 'back');
      if (a.sz === b.sz) adjacent.push(a.sz > 0 ? 'top' : 'bottom');
      if (adjacent.length !== 2) continue;
      const visibleAdjacent = adjacent.filter((id) => visibleFaceIds.has(id));
      const hiddenAdjacent = adjacent.filter((id) => !visibleFaceIds.has(id));
      if (visibleAdjacent.length === 1 && hiddenAdjacent.length === 1) {
        hiddenStrips.push({
          id: `${a.id}_${b.id}`,
          face: hiddenAdjacent[0]!,
          a: { x: a.x, y: a.y },
          b: { x: b.x, y: b.y },
        });
      }
    }
  }
  return { vertices, faces, hiddenStrips };
}

/** Onshape 命中优先级：角点 > 隐藏面边带 > 可见面。 */
function hitTargetAt(x: number, y: number, cube: ScreenCube): HitTarget | null {
  let nearestCorner: ScreenVertex | undefined;
  let nearestCornerDistance = 10;
  for (const vertex of cube.vertices) {
    if (vertex.visibleFaces.length === 0) continue;
    const d = Math.hypot(x - vertex.x, y - vertex.y);
    if (d <= nearestCornerDistance) {
      nearestCornerDistance = d;
      nearestCorner = vertex;
    }
  }
  if (nearestCorner)
    // 本地 +Y=Front 对应世界 -Y（viewRotationFromDirection 用世界 eye 方向）。
    return { kind: 'corner', id: nearestCorner.id, direction: [nearestCorner.sx, -nearestCorner.sy, nearestCorner.sz] };

  let nearestStrip: HiddenStrip | undefined;
  let nearestStripDistance = 6;
  for (const strip of cube.hiddenStrips) {
    const d = distanceToSegment(x, y, strip.a.x, strip.a.y, strip.b.x, strip.b.y);
    if (d <= nearestStripDistance) {
      nearestStripDistance = d;
      nearestStrip = strip;
    }
  }
  if (nearestStrip)
    return { kind: 'hidden', face: nearestStrip.face, edgeId: nearestStrip.id };

  for (const face of cube.faces) {
    if (pointInPolygon(x, y, face.points))
      return { kind: 'face', face: face.id };
  }
  return null;
}

export function ViewCube({ viewport, displaySettings, onOpenGraphicsPreferences }: ViewCubeProps): React.JSX.Element {
  const { t } = useTranslation();
  const [rotation, setRotation] = React.useState(() => Matrix3d.createIdentity());
  const [hoverTarget, setHoverTarget] = React.useState<HitTarget | null>(null);
  const [hoverCompass, setHoverCompass] = React.useState<'n' | 's' | 'e' | 'w' | null>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<number | null>(null);
  const history = useViewCubeHistory(viewport);

  React.useEffect(() => {
    if (!viewport || typeof viewport.view.getRotation !== 'function') return;
    const update = (): void => {
      // clone：iTwin 的 view.setRotation 可能原地改写同一 Matrix3d 实例，
      // 直接存引用会让 React/Object.is 判等跳过渲染（实测 cube 停在旧朝向）。
      setRotation(viewport.view.getRotation().clone());
    };
    update();
    const event = viewport.onViewChanged;
    if (!event || typeof event.addListener !== 'function') return;
    event.addListener(update);
    return () => { event.removeListener(update); };
  }, [viewport]);

  // core-frontend 的 setStandardRotation/synchWithView 不保证 raise onViewChanged
  //（实测：程序化换视图后 cube 会停在旧朝向）——动作后显式回读一次。
  const syncRotation = React.useCallback((): void => {
    if (viewport && typeof viewport.view.getRotation === 'function')
      setRotation(viewport.view.getRotation().clone());
  }, [viewport]);

  // Onshape：面/边/角/罗盘点击都是 ~180ms 平滑相机动画（不是瞬跳）。
  // iTwin FrustumAnimator 负责绕 target 的 eye 摆动；这里额外跑一个 400ms 的
  // rAF 回读，确保 ViewCube 与相机逐帧同步（onViewChanged 不保证每帧触发）。
  const startTracking = React.useCallback((): void => {
    if (typeof requestAnimationFrame !== 'function') return;
    if (trackRef.current !== null) cancelAnimationFrame(trackRef.current);
    const until = performance.now() + 400;
    const tick = (): void => {
      syncRotation();
      if (performance.now() < until)
        trackRef.current = requestAnimationFrame(tick);
      else
        trackRef.current = null;
    };
    trackRef.current = requestAnimationFrame(tick);
  }, [syncRotation]);

  const commitView = React.useCallback((): void => {
    if (!viewport) return;
    if (typeof viewport.animateFrustumChange === 'function') {
      viewport.animateFrustumChange({ animationTime: 180 });
      startTracking();
    } else {
      viewport.synchWithView({});
      syncRotation();
    }
  }, [viewport, startTracking, syncRotation]);

  React.useEffect(() => () => {
    if (trackRef.current !== null) cancelAnimationFrame(trackRef.current);
  }, []);

  const applyRotation = React.useCallback((dir: { x: number; y: number; z: number }) => {
    if (!viewport) return;
    const nextRotation = viewRotationFromDirection(Vector3d.create(dir.x, dir.y, dir.z));
    if (!nextRotation) return;
    history.rememberView();
    const view = viewport.view;
    if (typeof view.setRotationAboutPoint === 'function') view.setRotationAboutPoint(nextRotation);
    else view.setRotation(nextRotation);
    if (view.is3d()) view.turnCameraOff();
    commitView();
  }, [viewport, commitView, history]);

  const setStandard = React.useCallback((id: StandardViewId) => {
    if (!viewport) return;
    history.rememberView();
    viewport.setStandardRotation(id);
    if (viewport.view.is3d()) viewport.view.turnCameraOff();
    commitView();
  }, [viewport, commitView, history]);

  /** 罗盘箭头：yaw 绕世界 Z / pitch 绕屏幕右轴，15° 步进（Onshape 左键步进）。 */
  const rotateBy = React.useCallback((yawDeg: number, pitchDeg: number) => {
    if (!viewport) return;
    const rotationNow = viewport.view.getRotation();
    const direction = rotationNow.rowZ();
    const right = rotationNow.rowX();
    const next = orbitDirection(
      direction,
      right,
      Angle.createDegrees(yawDeg).radians,
      Angle.createDegrees(pitchDeg).radians,
    );
    if (!next) return;
    applyRotation({ x: next.x, y: next.y, z: next.z });
  }, [viewport, applyRotation]);

  const screenCube = React.useMemo(() => buildScreenCube(rotation), [rotation]);

  const resolveHit = (
    event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
  ): HitTarget | null => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return hitTargetAt(event.clientX - rect.left, event.clientY - rect.top, screenCube);
  };

  const onStagePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    // 罗盘/Home/触发器是按钮，保留它们自己的 hover 行为。
    if ((event.target as HTMLElement).closest('button')) {
      setHoverTarget(null);
      return;
    }
    setHoverTarget(resolveHit(event));
  };

  const onStagePointerLeave = (): void => { setHoverTarget(null); };

  const onStageClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('button')) return;
    const hit = resolveHit(event);
    if (!hit) return;
    if (hit.kind === 'face' || hit.kind === 'hidden') {
      const face = FACE_BY_ID.get(hit.face);
      if (face) setStandard(face.viewId);
      return;
    }
    applyRotation({ x: hit.direction[0], y: hit.direction[1], z: hit.direction[2] });
  };

  const transform = React.useMemo(() => cssMatrix3dFromRotation(rotation), [rotation]);
  const corners = React.useMemo(() => projectCubeCorners(rotation), [rotation]);
  const faceLabels = React.useMemo(
    () => projectFaceLabels(rotation).map((label) => ({
      id: label.id,
      x: 75 + label.x,
      y: 75 + label.y,
    })),
    [rotation],
  );
  // Onshape live：三面标签为屏幕对齐的直立文字（不随面倾斜）；Home 箭头只在
  // 自由视角出现（ISO/Front/Top 等标准视图均隐藏，2026-11-05 逐视图实证）。
  const atStandardView = React.useMemo(() => {
    const eye = rotation.rowZ();
    return STANDARD_VIEW_DIRECTIONS.some((dir) => eye.dotProduct(dir) > 0.9999);
  }, [rotation]);
  // Onshape live：三色轴锚在 Front 面左下角，画在立方体前面（z-index 3），
  // 每轴固定屏幕长度（X 60 / Y 46 / Z 56）；指向观察者的轴隐藏。
  const triad = React.useMemo(() => {
    const offset = frontFaceBottomLeft(rotation, HALF_SIZE);
    const origin = { x: 75 + offset.x, y: 75 + offset.y };
    const axes = axisScreenDirections(rotation);
    const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
    const endpoint = (dir: [number, number], length: number) => {
      const magnitude = Math.hypot(dir[0], dir[1]);
      if (!Number.isFinite(magnitude) || magnitude < 0.18) return undefined;
      const ux = dir[0] / magnitude;
      const uy = dir[1] / magnitude;
      return {
        x2: finite(origin.x + ux * length),
        y2: finite(origin.y + uy * length),
        lx: finite(origin.x + ux * (length + 9)),
        ly: finite(origin.y + uy * (length + 9)),
      };
    };
    return {
      origin,
      x: endpoint(axes.x, AXIS_LENGTHS.x),
      y: endpoint(axes.y, AXIS_LENGTHS.y),
      z: endpoint(axes.z, AXIS_LENGTHS.z),
    };
  }, [rotation]);

  return (
    <div
      className="part-studio-viewcube"
      data-testid="part-studio-viewcube"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div
        ref={stageRef}
        className={`part-studio-viewcube__stage${hoverTarget ? ' part-studio-viewcube__stage--interactive' : ''}`}
        title={t('partStudio.viewCube.title')}
        onPointerMove={onStagePointerMove}
        onPointerLeave={onStagePointerLeave}
        onClick={onStageClick}
      >
        {/* 罗盘：顶部两段弧形箭头 + 四向三角。hover 与 Onshape 一样高亮弧/三角本体。
            2026-11-05 按 live 像素重新定位：弧 x=22.5..54 / 96..127.5、y=9..32.5，
            三角 11×7.5（Onshape #e3e9ee，hover #c4e1f5）。 */}
        <svg className="part-studio-viewcube__compass" viewBox="0 0 150 150" aria-hidden="true">
          <g className={`part-studio-viewcube__compass-arc${hoverCompass === 'w' ? ' part-studio-viewcube__compass-arc--active' : ''}`}>
            <path d="M 54 9 Q 34 10 24 31" fill="none" strokeWidth="5" strokeLinecap="round" />
            <path d="M 22.5 33 l 1.5 -10 l 5 1.5 l -3 2.5 l 1.5 4 z" />
          </g>
          <g className={`part-studio-viewcube__compass-arc${hoverCompass === 'e' ? ' part-studio-viewcube__compass-arc--active' : ''}`}>
            <path d="M 96 9 Q 116 10 126 31" fill="none" strokeWidth="5" strokeLinecap="round" />
            <path d="M 127.5 33 l -1.5 -10 l -5 1.5 l 3 2.5 l -1.5 4 z" />
          </g>
          <polygon className={`part-studio-viewcube__compass-tri${hoverCompass === 'n' ? ' part-studio-viewcube__compass-tri--active' : ''}`} points="75,1.5 69.5,9 80.5,9" />
          <polygon className="part-studio-viewcube__compass-tri" points="148.5,75 141,69.5 141,80.5" />
          <polygon className={`part-studio-viewcube__compass-tri${hoverCompass === 's' ? ' part-studio-viewcube__compass-tri--active' : ''}`} points="75,148.5 69.5,141 80.5,141" />
          <polygon className="part-studio-viewcube__compass-tri" points="1.5,75 9,69.5 9,80.5" />
        </svg>

        {/* Home（Onshape live：只在自由视角显示 cube 左侧弯曲回退箭头；
            ISO/Front/Top 等标准视图隐藏——2026-11-05 逐视图实拍）。 */}
        {!atStandardView && (
          <button
            type="button"
            className="part-studio-viewcube__home"
            aria-label={t('partStudio.viewCube.homeView')}
            title={t('partStudio.viewCube.homeView')}
            data-testid="viewcube-home"
            onClick={() => applyRotation(ISO_DIRECTION)}
          >
            <OnshapeIcon name="undo-button" size={20} />
          </button>
        )}

        {/* 旋转热区：顶部两弧（yaw ±15°）+ 上下三角（pitch ±15°）。
            Onshape 按住不连发，只单步。 */}
        <button type="button" className="part-studio-viewcube__arrow-hit part-studio-viewcube__arrow-hit--nw" aria-label={t('partStudio.viewCube.rotateLeft')} onClick={() => rotateBy(-15, 0)} onMouseEnter={() => setHoverCompass('w')} onMouseLeave={() => setHoverCompass(null)} />
        <button type="button" className="part-studio-viewcube__arrow-hit part-studio-viewcube__arrow-hit--ne" aria-label={t('partStudio.viewCube.rotateRight')} onClick={() => rotateBy(15, 0)} onMouseEnter={() => setHoverCompass('e')} onMouseLeave={() => setHoverCompass(null)} />
        <button type="button" className="part-studio-viewcube__arrow-hit part-studio-viewcube__arrow-hit--n" aria-label={t('partStudio.viewCube.rotateUp')} onClick={() => rotateBy(0, -15)} onMouseEnter={() => setHoverCompass('n')} onMouseLeave={() => setHoverCompass(null)} />
        <button type="button" className="part-studio-viewcube__arrow-hit part-studio-viewcube__arrow-hit--s" aria-label={t('partStudio.viewCube.rotateDown')} onClick={() => rotateBy(0, 15)} onMouseEnter={() => setHoverCompass('s')} onMouseLeave={() => setHoverCompass(null)} />
        {/* Onshape live：左右三角只可点击 yaw 15°，hover 不亮（实拍）。鼠标专属，
            不占用可访问名称（弧线按钮已提供同名可访问控件）。 */}
        <button type="button" className="part-studio-viewcube__arrow-hit part-studio-viewcube__arrow-hit--w" aria-hidden="true" tabIndex={-1} onClick={() => rotateBy(-15, 0)} />
        <button type="button" className="part-studio-viewcube__arrow-hit part-studio-viewcube__arrow-hit--e" aria-hidden="true" tabIndex={-1} onClick={() => rotateBy(15, 0)} />

        <div className="part-studio-viewcube__cube" style={{ transform }}>
          {FACES.map((face) => (
            <button
              key={face.id}
              type="button"
              className={`part-studio-viewcube__face part-studio-viewcube__face--${face.id}${hoverTarget?.kind === 'face' && hoverTarget.face === face.id ? ' part-studio-viewcube__face--hovered' : ''}`}
              style={{ transform: face.transform }}
              aria-label={t(`partStudio.viewCube.faces.${face.id}`)}
              data-testid={`viewcube-face-${face.id}`}
              onClick={() => setStandard(face.viewId)}
            />
          ))}
        </div>

        {/* 隐藏面边带 + 角点 hover 高亮（Onshape：面蓝贴片、隐藏面蓝边带、角点蓝圆点）。 */}
        <div className="part-studio-viewcube__picks" aria-hidden="true">
          <svg viewBox="0 0 150 150">
            {screenCube.hiddenStrips.map((strip) => (
              <line
                key={strip.id}
                className={`part-studio-viewcube__hidden-strip${hoverTarget?.kind === 'hidden' && hoverTarget.edgeId === strip.id ? ' part-studio-viewcube__hidden-strip--active' : ''}`}
                x1={strip.a.x}
                y1={strip.a.y}
                x2={strip.b.x}
                y2={strip.b.y}
              />
            ))}
            {hoverTarget?.kind === 'corner' && (() => {
              const vertex = screenCube.vertices.find((item) => item.id === hoverTarget.id);
              return vertex
                ? <circle className="part-studio-viewcube__corner-dot" cx={vertex.x} cy={vertex.y} r="9" />
                : null;
            })()}
          </svg>
        </div>

        {/* 屏幕对齐面标签（Onshape live：上/前/右均直立，不随面倾斜）。 */}
        <div className="part-studio-viewcube__labels" aria-hidden="true">
          {faceLabels.map((label) => (
            <span
              key={label.id}
              className="part-studio-viewcube__face-label"
              style={{ left: label.x, top: label.y }}
              data-testid={`viewcube-label-${label.id}`}
            >
              {t(`partStudio.viewCube.faces.${label.id}`)}
            </span>
          ))}
        </div>

        {/* 不可见角点命中区：点击 = 该角的 trimetric 方向；hover 才出现淡点。 */}
        {corners.map((corner) => (
          <button
            key={corner.id}
            type="button"
            className="part-studio-viewcube__corner-hit"
            style={{
              left: `calc(50% + ${corner.x}px)`,
              top: `calc(50% + ${corner.y}px)`,
            }}
            aria-label={t('partStudio.viewCube.cornerView')}
            data-testid={`viewcube-corner-${corner.id}`}
            onClick={() => applyRotation({
              x: corner.direction[0], y: corner.direction[1], z: corner.direction[2],
            })}
          />
        ))}

        <div className="part-studio-viewcube__axes" aria-hidden="true">
          <svg viewBox="0 0 150 150">
            {AXIS_IDS.map((axis) => {
              const line = triad[axis];
              if (!line) return null;
              const color = AXIS_COLORS[axis];
              return (
                <g key={axis} data-testid={`viewcube-axis-${axis}`}>
                  <line
                    x1={triad.origin.x}
                    y1={triad.origin.y}
                    x2={line.x2}
                    y2={line.y2}
                    stroke={color}
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                  <text
                    x={line.lx}
                    y={line.ly}
                    fill={color}
                    fontSize="11"
                    fontWeight="700"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {axis.toUpperCase()}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <ViewCubeCameraMenu
          viewport={viewport}
          displaySettings={displaySettings}
          onOpenGraphicsPreferences={onOpenGraphicsPreferences}
          history={history}
          commitView={commitView}
        />
      </div>
    </div>
  );
}
