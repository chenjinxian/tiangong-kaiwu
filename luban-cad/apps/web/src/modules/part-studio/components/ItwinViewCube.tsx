/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 官方 iTwin Viewer ViewCube（`@itwin/imodel-components-react` 的
 * `CubeNavigationAid`，AppUI `CubeNavigationAidControl` 同源）。
 * 2026-11-05 用户裁决：官方默认交互手感明显更好，改为**默认渲染**；保留
 * `?viewcube=onshape` 自研模式作为回退/Onshape 演示用。
 *
 * 官方 cube 原生没有相机/渲染菜单；这里复用自研模式的 `ViewCubeCameraMenu`
 * （同一套菜单项、定位、测试 id），官方模式仍只有一套实现，无第二套菜单。
 */
import React from 'react';
import type { IModelConnection, ScreenViewport } from '@itwin/core-frontend';
import {
  CubeNavigationAid,
  UiIModelComponents,
  ViewportComponentEvents,
} from '@itwin/imodel-components-react';
import { useItwinViewCubeBridge } from '../hooks/useItwinViewCubeBridge.js';
import type { UseDisplaySettingsResult } from '../hooks/useDisplaySettings.js';
import {
  ViewCubeCameraMenu,
  useViewCubeHistory,
} from './ViewCubeCameraMenu.js';
import './ItwinViewCube.css';

export interface ItwinViewCubeProps {
  viewport?: ScreenViewport | null;
  connection?: IModelConnection | null;
  displaySettings?: UseDisplaySettingsResult;
  /** 打开 Onshape 式「图形首选项」左侧对话框（宿主渲染）。 */
  onOpenGraphicsPreferences?: () => void;
  /** 2026-11-13：Onshape 语义「缩放到合适大小」（可见内容取景）宿主出口。 */
  onFitVisibleContent?: () => void;
}

/**
 * `UiIModelComponents.initialize()` 注册 `UiIModelComponents` locale 命名空间
 * （cube 六面标签）并初始化 `UiComponents`；组件类的 `_labels` 在构造时求值，
 * 因此必须等 initialize 落定再挂 CubeNavigationAid，否则标签为空且不会刷新。
 * 模块级 promise 防 StrictMode 双调用。
 */
let labelsReadyPromise: Promise<void> | undefined;

function ensureLabelsReady(): Promise<void> {
  if (UiIModelComponents.initialized) return Promise.resolve();
  labelsReadyPromise ??= UiIModelComponents.initialize();
  return labelsReadyPromise;
}

export function ItwinViewCube({
  viewport,
  connection,
  displaySettings,
  onOpenGraphicsPreferences,
  onFitVisibleContent,
}: ItwinViewCubeProps): React.ReactElement | null {
  const [labelsReady, setLabelsReady] = React.useState(UiIModelComponents.initialized);
  const history = useViewCubeHistory(viewport);
  const trackRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void ensureLabelsReady()
      .then(() => {
        if (!cancelled) setLabelsReady(true);
      })
      .catch((err: unknown) => {
        // locale 失败不回滚 cube：官方组件会退化为空标签，但旋转/拖拽仍可用。
        console.warn('[ItwinViewCube] UiIModelComponents.initialize failed:', err);
        if (!cancelled) setLabelsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 菜单相机动作与自研模式同节奏（180ms + 400ms 回读）：官方 cube 只在
  // `ViewportComponentEvents.onViewRotationChangeEvent` 更新朝向，菜单动作不是
  // cube 自发事件，因此需要主动逐帧 setViewMatrix，否则朝向会滞后到动画结束。
  const commitView = React.useCallback((): void => {
    if (!viewport) return;
    if (typeof viewport.animateFrustumChange === 'function') {
      viewport.animateFrustumChange({ animationTime: 180 });
      if (typeof requestAnimationFrame !== 'function') return;
      if (trackRef.current !== null) cancelAnimationFrame(trackRef.current);
      const until = performance.now() + 400;
      const tick = (): void => {
        ViewportComponentEvents.setViewMatrix(viewport);
        if (performance.now() < until)
          trackRef.current = requestAnimationFrame(tick);
        else
          trackRef.current = null;
      };
      trackRef.current = requestAnimationFrame(tick);
    } else {
      viewport.synchWithView({});
      ViewportComponentEvents.setViewMatrix(viewport);
    }
  }, [viewport]);

  React.useEffect(() => () => {
    if (trackRef.current !== null) cancelAnimationFrame(trackRef.current);
  }, []);

  useItwinViewCubeBridge(viewport);

  // 单测里 viewport 常是只满足结构断言的 mock；无官方 cube 所需的最小面时
  // 不挂载（菜单/官方包也不加载），避免 jsdom 崩在 componentDidMount。
  const viewportReady = !!viewport && !!connection
    && typeof viewport.view?.getRotation === 'function'
    && typeof viewport.onViewChanged?.addListener === 'function';

  if (!viewportReady) return null;

  return (
    <div
      className="part-studio-itwin-viewcube"
      data-testid="part-studio-itwin-viewcube"
      data-locale-ready={labelsReady ? 'true' : 'false'}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {labelsReady && (
        <CubeNavigationAid
          iModelConnection={connection}
          viewport={viewport}
        />
      )}
      <ViewCubeCameraMenu
        viewport={viewport}
        displaySettings={displaySettings}
        onOpenGraphicsPreferences={onOpenGraphicsPreferences}
        onFitVisibleContent={onFitVisibleContent}
        history={history}
        commitView={commitView}
      />
    </div>
  );
}

export default ItwinViewCube;
