# iTwin.js 完整工具参考文档

> **版本**: iTwin.js 5.x  
> **最后更新**: 2026-04-08  
> **总工具数**: 约 300 个

---

## 目录

1. [概述](#一概述)
2. [Core/Frontend 工具](#二corefrontend-工具)
3. [Core/Frontend-Devtools 工具](#三corefrontend-devtools-工具)
4. [Editor/Frontend 工具](#四editorfrontend-工具)
5. [Display-Test-App 工具](#五display-test-app-工具)
6. [Core/Markup 工具](#六coremarkup-工具)
7. [工具继承层次](#七工具继承层次结构)
8. [快速参考表](#八快速参考表)

---

## 一、概述

iTwin.js 提供了约 **300 个工具**，分布在以下包中：

| 包名 | 路径 | 工具数 | 用途 |
|------|------|--------|------|
| `core/frontend` | `/core/frontend/src/tools/` | 70+ | 核心交互、导航、测量 |
| `core/frontend-devtools` | `/core/frontend-devtools/src/` | 100+ | 调试、开发、测试 |
| `editor/frontend` | `/editor/frontend/src/` | 47 | CAD 编辑、建模 |
| `test-apps/display-test-app` | `/test-apps/display-test-app/src/` | 61 | 测试演示 |
| `core/markup` | `/core/markup/src/` | 13 | SVG 标记注释 |

### 工具基类

```typescript
// 所有工具继承自 Tool 基类
Tool
├── InteractiveTool
│   ├── PrimitiveTool      // 需要元素选择的工具
│   ├── ViewTool           // 视图操作工具
│   └── InputCollector     // 输入收集器
└── ViewManip              // 视图操控工具
```

### 工具注册

```typescript
// 工具通过 ToolRegistry 注册
IModelApp.tools.register(MyTool, "MyNamespace");

// 运行工具
await IModelApp.tools.run("MyToolId", ...args);
```

---

## 二、Core/Frontend 工具

### 2.1 选择工具

| 工具名称 | 工具 ID | 功能描述 | 图标 |
|---------|---------|----------|------|
| **SelectionTool** | `Select` | 选择元素进行检查或操作 | `icon-cursor` |

**选择方法**: `Pick` (点选), `Line` (线选), `Box` (框选)  
**选择模式**: `Replace` (替换), `Add` (添加), `Remove` (移除)  
**快捷键**: 
- `Ctrl + 点击`: 添加到选择集
- `Shift + 点击`: 从选择集移除
- `Ctrl + A`: 选择全部

---

### 2.2 视图导航工具 (11个)

| 工具名称 | 工具 ID | 功能描述 | 图标 | 快捷键 |
|---------|---------|----------|------|--------|
| **PanViewTool** | `View.Pan` | 平移视图 | `icon-hand-2` | 鼠标中键拖动 |
| **RotateViewTool** | `View.Rotate` | 绕指定点旋转视图 | `icon-gyroscope` | 右键拖动 |
| **LookViewTool** | `View.Look` | 环顾设计 | `icon-view-navigation` | - |
| **ScrollViewTool** | `View.Scroll` | 滚动视图 | `icon-move` | - |
| **ZoomViewTool** | `View.Zoom` | 改变视图缩放 | `icon-zoom` | 滚轮 |
| **LookAndMoveTool** | `View.LookAndMove` | 在设计中行走 | `icon-walk` | - |
| **WalkViewTool** | `View.Walk` | 在设计中行走 | `icon-walk` | - |
| **FlyViewTool** | `View.Fly` | 在设计中飞行 | `icon-airplane` | - |
| **FitViewTool** | `View.Fit` | 显示整个模型 | `icon-fit-to-view` | `Ctrl+Home` |
| **WindowAreaTool** | `View.WindowArea` | 选择查看区域 | `icon-window-area` | - |
| **StandardViewTool** | `View.Standard` | 对齐到标准视图 | `icon-cube-faces-top` | - |

**使用示例**:
```typescript
// 运行平移工具
await IModelApp.tools.run("View.Pan");

// 缩放到选择元素
await IModelApp.tools.run("View.Fit", selectedElements);
```

---

### 2.3 视图操作工具 (8个)

| 工具名称 | 工具 ID | 功能描述 | 快捷键 |
|---------|---------|----------|--------|
| **ViewUndoTool** | `View.Undo` | 撤销最近的视图更改 | `Ctrl+Shift+Z` |
| **ViewRedoTool** | `View.Redo` | 重做最近撤销的视图更改 | `Ctrl+Shift+Y` |
| **ViewToggleCameraTool** | `View.ToggleCamera` | 开启/关闭相机 | - |
| **SetupCameraTool** | `View.SetupCamera` | 设置视图相机 | - |
| **SetupWalkCameraTool** | `View.SetupWalkCamera` | 设置行走相机 | - |
| **ViewGlobeSatelliteTool** | `View.GlobeSatellite` | 卫星视角查看位置 | - |
| **ViewGlobeBirdTool** | `View.GlobeBird` | 鸟瞰视角查看位置 | - |
| **ViewGlobeLocationTool** | `View.GlobeLocation` | 从字符串查看地球上的位置 | - |
| **ViewGlobeIModelTool** | `View.GlobeIModel` | 在地球上查看项目 iModel | - |

---

### 2.4 测量工具 (6个)

| 工具名称 | 工具 ID | 功能描述 | 图标 |
|---------|---------|----------|------|
| **MeasureDistanceTool** | `Measure.Distance` | 测量点之间的距离 | `icon-measure-distance` |
| **MeasureLocationTool** | `Measure.Location` | 显示坐标位置 | `icon-measure-location` |
| **MeasureAreaByPointsTool** | `Measure.AreaByPoints` | 通过点测量面积 | `icon-measure-2d` |
| **MeasureLengthTool** | `Measure.Length` | 测量元素长度 | `icon-measure` |
| **MeasureAreaTool** | `Measure.Area` | 测量元素面积 | `icon-measure-area` |
| **MeasureVolumeTool** | `Measure.Volume` | 测量元素体积 | `icon-measure-3d` |

**使用示例**:
```typescript
// 启动距离测量工具
await IModelApp.tools.run("Measure.Distance");

// 获取测量结果事件
IModelApp.measureManager.onMeasurementAdded.addListener((measurement) => {
  console.log("测量完成:", measurement);
});
```

---

### 2.5 视图裁剪工具 (6个)

| 工具名称 | 工具 ID | 功能描述 | 图标 |
|---------|---------|----------|------|
| **ViewClipClearTool** | `ViewClip.Clear` | 从视图中移除裁剪体 | - |
| **ViewClipByPlaneTool** | `ViewClip.ByPlane` | 用平面剖切视图 | `icon-section-plane` |
| **ViewClipByShapeTool** | `ViewClip.ByShape` | 通过形状创建裁剪体 | `icon-section-shape` |
| **ViewClipByRangeTool** | `ViewClip.ByRange` | 通过范围创建裁剪体 | `icon-section-range` |
| **ViewClipByElementTool** | `ViewClip.ByElement` | 从元素创建裁剪体 | `icon-section-element` |

---

### 2.6 AccuDraw 工具 (25+个)

AccuDraw 是 iTwin.js 的精确绘图辅助系统。

#### 会话控制

| 工具名称 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **AccuDrawSessionToggleTool** | `AccuDraw.SessionToggle` | 启用/禁用 AccuDraw |
| **AccuDrawSuspendToggleTool** | `AccuDraw.SuspendToggle` | 暂停/恢复 AccuDraw |

#### 原点设置

| 工具名称 | 工具 ID | 功能描述 | 快捷键 |
|---------|---------|----------|--------|
| **AccuDrawSetOriginTool** | `AccuDraw.SetOrigin` | 设置 AccuDraw 原点 | `O` |

#### 轴锁定

| 工具名称 | 工具 ID | 功能描述 | 快捷键 |
|---------|---------|----------|--------|
| **AccuDrawSetLockXTool** | `AccuDraw.LockX` | 锁定 X 轴 | `X` |
| **AccuDrawSetLockYTool** | `AccuDraw.LockY` | 锁定 Y 轴 | `Y` |
| **AccuDrawSetLockZTool** | `AccuDraw.LockZ` | 锁定 Z 轴 | `Z` |
| **AccuDrawSetLockDistanceTool** | `AccuDraw.LockDistance` | 锁定距离 | `D` |
| **AccuDrawSetLockAngleTool** | `AccuDraw.LockAngle` | 锁定角度 | `A` |
| **AccuDrawSetLockIndexTool** | `AccuDraw.LockIndex` | 锁定索引 | `Enter` |
| **AccuDrawSetLockSmartTool** | `AccuDraw.LockSmart` | 智能锁定 | `Space` |

#### 旋转模式

| 工具名称 | 工具 ID | 功能描述 | 快捷键 |
|---------|---------|----------|--------|
| **AccuDrawRotateCycleTool** | `AccuDraw.RotateCycle` | 循环切换旋转 | `Q` |
| **AccuDrawRotateTopTool** | `AccuDraw.RotateTop` | 旋转到顶视图 | `T` |
| **AccuDrawRotateFrontTool** | `AccuDraw.RotateFront` | 旋转到前视图 | `F` |
| **AccuDrawRotateSideTool** | `AccuDraw.RotateSide` | 旋转到侧视图 | `S` |
| **AccuDrawRotateViewTool** | `AccuDraw.RotateView` | 旋转到视图方向 | `V` |
| **AccuDrawRotate90AboutXTool** | `AccuDraw.Rotate90AboutX` | 绕 X 轴旋转 90° | - |
| **AccuDrawRotate90AboutYTool** | `AccuDraw.Rotate90AboutY` | 绕 Y 轴旋转 90° | - |
| **AccuDrawRotate90AboutZTool** | `AccuDraw.Rotate90AboutZ` | 绕 Z 轴旋转 90° | - |

#### 坐标系

| 工具名称 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **AccuDrawRotateAxesTool** | `AccuDraw.RotateAxes` | 绕原点旋转坐标轴 |
| **AccuDrawRotateElementTool** | `AccuDraw.RotateElement` | 从元素获取旋转 |
| **DefineACSByElementTool** | `AccuDraw.DefineACSByElement` | 从元素定义辅助坐标系 |
| **DefineACSByPointsTool** | `AccuDraw.DefineACSByPoints` | 通过3点定义辅助坐标系 |

**模式切换**:
| 工具名称 | 工具 ID | 功能描述 | 快捷键 |
|---------|---------|----------|--------|
| **AccuDrawChangeModeTool** | `AccuDraw.ChangeMode` | 切换极坐标/直角坐标 | `M` |

---

## 三、Core/Frontend-Devtools 工具

调试和开发工具包，提供 100+ 个专业工具。

### 3.1 视口工具 (19个)

| 工具名称 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **FreezeSceneTool** | `FreezeScene` | 冻结/解冻场景 |
| **ShowTileVolumesTool** | `ShowTileVolumes` | 显示瓦片边界体积 |
| **ToggleTileTreeReferencesTool** | `ToggleTileTreeReferences` | 切换瓦片树引用 |
| **SetAspectRatioSkewTool** | `SetAspectRatioSkew` | 设置视口宽高比倾斜 |
| **ChangeHiliteModeTool** | `ChangeHiliteMode` | 更改高亮模式 |
| **ChangeHiliteSettingsTool** | `ChangeHiliteSettings` | 更改高亮设置 |
| **ChangeEmphasisSettingsTool** | `ChangeEmphasisSettings` | 更改强调设置 |
| **ChangeFlashSettingsTool** | `ChangeFlashSettings` | 更改闪烁设置 |
| **FadeOutTool** | `FadeOut` | 启用/禁用淡出透明模式 |
| **DefaultTileSizeModifierTool** | `DefaultTileSizeMod` | 设置默认瓦片大小修改器 |
| **ViewportTileSizeModifierTool** | `ViewportTileSizeMod` | 设置视口瓦片大小修改器 |
| **ViewportAddRealityModel** | `ViewportAddRealityModel` | 向视口添加现实模型 |
| **Toggle3dManipulationsTool** | `Toggle3dManipulations` | 切换3D操作标志 |
| **ToggleViewAttachmentsTool** | `ToggleViewAttachments` | 切换视图附件显示 |
| **ToggleViewAttachmentBoundariesTool** | `ToggleViewAttachmentBoundaries` | 切换视图附件边界 |
| **ToggleViewAttachmentClipShapesTool** | `ToggleViewAttachmentClipShapes` | 切换视图附件裁剪形状 |
| **ToggleDrawingGraphicsTool** | `ToggleDrawingGraphics` | 切换2D图形显示 |
| **ToggleSectionDrawingSpatialViewTool** | `ToggleSectionDrawingSpatialView` | 切换剖面图空间视图 |
| **ChangeCameraTool** | `ChangeCamera` | 更改相机设置 |

---

### 3.2 显示样式工具 (10个)

| 工具名称 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **ChangeViewFlagsTool** | `ChangeViewFlags` | 修改视图标志 |
| **ToggleSkyboxTool** | `ToggleSkybox` | 切换天空盒 |
| **SkySphereTool** | `SetSkySphere` | 设置天空球 |
| **SkyCubeTool** | `SetSkyCube` | 设置天空盒（6面） |
| **SaveRenderingStyleTool** | `SaveRenderingStyle` | 保存渲染样式为JSON |
| **ApplyRenderingStyleTool** | `ApplyRenderingStyle` | 应用渲染样式 |
| **OverrideSubCategoryTool** | `OverrideSubCategory` | 覆盖子类别外观 |
| **WoWIgnoreBackgroundTool** | `WoWIgnoreBackground` | 设置白底白反转忽略背景 |
| **ToggleWiremeshTool** | `ToggleWiremesh` | 切换线框覆盖显示 |
| **ChangeBackgroundColorTool** | `ChangeBackgroundColor` | 更改背景颜色 |

---

### 3.3 地图图层工具 (20个)

| 工具名称 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **AttachModelMapLayerTool** | `AttachModelMapLayerTool` | 附加模型地图图层 |
| **AttachWmsMapLayerByUrlTool** | `AttachWmsMapLayerTool` | 附加WMS地图图层 |
| **AttachWmtsMapLayerByUrlTool** | `AttachWmtsMapLayerTool` | 附加WMTS地图图层 |
| **AttachArcGISMapLayerByUrlTool** | `AttachArcGISMapLayerTool` | 附加ArcGIS地图图层 |
| **AttachArcGISFeatureMapLayerByUrlTool** | `AttachArcGISFeatureMapLayerTool` | 附加ArcGIS要素图层 |
| **AttachOgcApiFeaturesMapLayerTool** | `AttachOgcApiFeaturesMapLayerTool` | 附加OGC API要素图层 |
| **AttachTileURLMapLayerByUrlTool** | `AttachTileURLMapLayerTool` | 附加瓦片URL图层 |
| **AttachMapLayerTool** | `AttachMapLayerTool` | 附加命名地图图层 |
| **AttachMapOverlayTool** | `AttachMapOverlayTool` | 附加地图叠加层 |
| **SetMapBaseTool** | `SetMapBaseTool` | 设置地图基底 |
| **DetachMapLayersTool** | `DetachMapLayersTool` | 分离所有地图图层 |
| **MapLayerVisibilityTool** | `SetMapLayerVisibility` | 设置地图图层可见性 |
| **ReorderMapLayers** | `ReorderMapLayers` | 重新排序地图图层 |
| **MapLayerTransparencyTool** | `SetMapLayerTransparency` | 设置地图图层透明度 |
| **MapLayerSubLayerVisibilityTool** | `SetMapSubLayerVisibility` | 设置子图层可见性 |
| **MapLayerZoomTool** | `MapLayerZoom` | 缩放到地图图层范围 |
| **ToggleTerrainTool** | `ToggleTerrain` | 切换地形高度应用 |
| **MapBaseColorTool** | `SetMapBaseColorTool` | 设置地图基底颜色 |
| **MapBaseTransparencyTool** | `SetMapBaseTransparencyTool` | 设置地图基底透明度 |
| **MapBaseVisibilityTool** | `SetMapBaseVisibilityTool` | 设置地图基底可见性 |

**使用示例**:
```typescript
// 附加 WMS 图层
await IModelApp.tools.run("AttachWmsMapLayerTool", {
  url: "https://example.com/wms",
  layerName: "roads"
});

// 切换地形
await IModelApp.tools.run("ToggleTerrain");
```

---

### 3.4 现实模型工具 (10个)

| 工具名称 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **AttachRealityModelTool** | `AttachRealityModelTool` | 附加现实模型 |
| **SaveRealityModelTool** | `SaveRealityModelTool` | 保存现实模型JSON |
| **SetRealityModelTransparencyTool** | `SetRealityModelTransparencyTool` | 设置现实模型透明度 |
| **SetRealityModelLocateTool** | `SetRealityModelLocateTool` | 设置现实模型可定位性 |
| **SetRealityModelEmphasizedTool** | `SetRealityModelEmphasizedTool` | 设置现实模型强调 |
| **DetachRealityModelTool** | `ViewportDetachRealityModel` | 分离现实模型 |
| **SetRealityModelColorTool** | `SetRealityModelColorTool` | 设置现实模型颜色 |
| **ClearRealityModelAppearanceOverrides** | `ClearRealityModelAppearanceOverrides` | 清除外观覆盖 |
| **AttachCesiumAssetTool** | `AttachCesiumAssetTool` | 附加Cesium资源 |
| **ToggleOSMBuildingDisplay** | `SetBuildingDisplay` | 切换OpenStreetMap建筑显示 |

---

### 3.5 元素强调工具 (5个)

| 工具名称 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **EmphasizeSelectedElementsTool** | `EmphasizeSelectedElements` | 强调选中元素 |
| **IsolateSelectedElementsTool** | `IsolateSelectedElements` | 隔离选中元素 |
| **ClearIsolatedElementsTool** | `ClearIsolatedElements` | 清除隔离元素 |
| **ClearEmphasizedElementsTool** | `ClearEmphasizedElements` | 清除强调元素 |
| **EmphasizeVisibleElementsTool** | `EmphasizeVisibleElements` | 强调可见元素 |

**使用示例**:
```typescript
// 隔离选中元素
await IModelApp.tools.run("IsolateSelectedElements");

// 清除所有强调
await IModelApp.tools.run("ClearEmphasizedElements");
```

---

### 3.6 平面遮罩工具 (12个)

| 工具名称 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **SetMapHigherPriorityMasking** | `SetMapHigherPriorityMask` | 设置地图高优先级遮罩 |
| **UnmaskMapTool** | `UnmaskMap` | 移除地图遮罩 |
| **MaskBackgroundMapByElementTool** | `MaskBackgroundMapByElement` | 按元素遮罩背景地图 |
| **MaskBackgroundMapByExcludedElementTool** | `MaskBackgroundMapByExcludedElement` | 按排除元素遮罩背景地图 |
| **MaskBackgroundMapBySubCategoryTool** | `MaskBackgroundMapBySubCategory` | 按子类别遮罩背景地图 |
| **MaskBackgroundMapByModelTool** | `MaskBackgroundMapByModel` | 按模型遮罩背景地图 |
| **MaskRealityModelByElementTool** | `MaskRealityModelByElement` | 按元素遮罩现实模型 |
| **MaskRealityModelByExcludedElementTool** | `MaskRealityModelByExcludedElement` | 按排除元素遮罩现实模型 |
| **MaskRealityModelByModelTool** | `MaskRealityModelByModel` | 按模型遮罩现实模型 |
| **MaskRealityModelBySubCategoryTool** | `MaskRealityModelBySubCategory` | 按子类别遮罩现实模型 |
| **SetHigherPriorityRealityModelMasking** | `SetHigherPriorityRealityModelMasking` | 设置高优先级现实模型遮罩 |
| **UnmaskRealityModelTool** | `UnmaskRealityModel` | 移除现实模型遮罩 |

---

### 3.7 视觉效果工具 (16个)

| 工具名称 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **ClearEffectsTool** | `ClearEffects` | 清除所有屏幕空间效果 |
| **VignetteEffect** | `VignetteEffect` | 应用渐晕效果 |
| **LensDistortionEffect** | `LensDistortionEffect` | 应用镜头畸变效果 |
| **SaturationEffect** | `SaturationEffect` | 调整颜色饱和度 |
| **SnowEffect** | `SnowEffect` | 应用雪花粒子效果 |
| **ExplosionEffect** | `ExplosionEffect` | 应用爆炸粒子效果 |
| **FlipImageEffect** | `FlipImageEffect` | 翻转图像效果 |
| **GaussianBlurEffect** | `GaussianBlurEffect` | 高斯模糊 |
| **UnsharpenEffect** | `UnsharpenEffect` | 非锐化滤镜 |
| **EmbossEffect** | `EmbossEffect` | 浮雕效果 |
| **SharpenEffect** | `SharpenEffect` | 锐化效果 |
| **SharpnessEffect** | `SharpnessEffect` | 清晰度调整 |
| **EdgeDetectionEffect** | `EdgeDetectionEffect` | 边缘检测 |

---

### 3.8 渲染调试工具 (15个)

| 工具名称 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **LoseWebGLContextTool** | `LoseWebGLContext` | 强制丢失WebGL上下文 |
| **CompileShadersTool** | `CompileShaders` | 编译所有着色器 |
| **ToggleDPIForLODTool** | `ToggleDPIForLOD` | 切换DPI感知LOD |
| **ToggleReadPixelsTool** | `ToggleReadPixels` | 切换read pixels渲染 |
| **ToggleDrapeFrustumTool** | `ToggleDrapeFrustum` | 显示drape视锥体 |
| **ToggleMaskFrustumTool** | `ToggleMaskFrustum` | 显示遮罩视锥体 |
| **TogglePrimitiveVisibilityTool** | `TogglePrimitiveVisibility` | 切换图元可见性 |
| **ToggleRealityTileBounds** | `ToggleRealityTileBounds` | 显示现实瓦片边界 |
| **ToggleRealityTilePreload** | `ToggleRealityTilePreload` | 显示现实瓦片预加载 |
| **ToggleRealityTileFreeze** | `ToggleRealityTileFreeze` | 冻结现实瓦片加载 |
| **ToggleRealityTileLogging** | `ToggleRealityTileLogging` | 记录现实瓦片日志 |
| **ToggleVolClassIntersect** | `ToggleVCIntersect` | 切换体积类相交支持 |
| **SetAASamplesTool** | `SetAASamples` | 设置抗锯齿样本数 |
| **ToggleNormalMaps** | `ToggleNormalMaps` | 切换法线贴图 |

---

## 四、Editor/Frontend 工具

CAD 编辑工具，共 47 个，分为以下类别：

### 4.1 草图工具 (6个)

| 工具类名 | 工具 ID | 图标 | 功能描述 |
|---------|---------|------|----------|
| **CreateLineStringTool** | `CreateLineString` | `icon-snaps` | 创建线串或形状 |
| **CreateArcTool** | `CreateArc` | `icon-three-points-circular-arc` | 创建圆弧（3点或圆心/角度法）|
| **CreateCircleTool** | `CreateCircle` | `icon-circle` | 创建圆形 |
| **CreateEllipseTool** | `CreateEllipse` | `icon-ellipse` | 创建椭圆 |
| **CreateRectangleTool** | `CreateRectangle` | `icon-rectangle` | 创建矩形 |
| **CreateBCurveTool** | `CreateBCurve` | `icon-snaps-nearest` | 创建B样条曲线 |

**使用示例**:
```typescript
import { CreateLineStringTool } from "@itwin/editor-frontend";

// 注册并运行工具
await IModelApp.tools.run(CreateLineStringTool.toolId);
```

---

### 4.2 实体基本体工具 (5个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **CreateSphereTool** | `CreateSphere` | 创建球体 |
| **CreateCylinderTool** | `CreateCylinder` | 创建圆柱体 |
| **CreateConeTool** | `CreateCone` | 创建圆锥体 |
| **CreateBoxTool** | `CreateBox` | 创建盒子 |
| **CreateTorusTool** | `CreateTorus` | 创建圆环体 |

---

### 4.3 曲线修改工具 (6个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **OffsetCurveTool** | `OffsetCurve` | 对路径和环应用偏移 |
| **BreakCurveTool** | `BreakCurve` | 打开环和分割路径 |
| **ExtendCurveTool** | `ExtendCurve` | 延伸或修剪路径或开放曲线 |
| **RegionBooleanTool** | `RegionBoolean` | 平面区域的并/差/交运算 |
| **ExtrudeCurveTool** | `ExtrudeCurve` | 拉伸路径和区域 |
| **RevolveCurveTool** | `RevolveCurve` | 旋转路径和区域 |

---

### 4.4 实体建模工具

#### 布尔运算 (3个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **UniteSolidElementsTool** | `UniteSolids` | 布尔并集运算 |
| **SubtractSolidElementsTool** | `SubtractSolids` | 布尔差集运算 |
| **IntersectSolidElementsTool** | `IntersectSolids` | 布尔交集运算 |

#### 曲面操作 (6个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **SewSheetElementsTool** | `SewSheets` | 曲面缝合操作 |
| **ThickenSheetElementsTool** | `ThickenSheets` | 曲面加厚操作 |
| **CutSolidElementsTool** | `CutSolids` | 使用区域或路径剖面切割实体 |
| **EmbossSolidElementsTool** | `EmbossSolids` | 使用曲面剖面进行浮雕/凹陷 |
| **SweepAlongPathTool** | `SweepAlongPath` | 沿路径扫掠剖面创建实体或曲面 |
| **LoftProfilesTool** | `LoftProfiles` | 通过放样一组剖面创建实体或曲面 |

#### 面和边操作 (8个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **OffsetFacesTool** | `OffsetFaces` | 识别实体和曲面的面进行偏移 |
| **HollowFacesTool** | `HollowFaces` | 识别面进行偏移以挖空实体（抽壳）|
| **DeleteSubEntitiesTool** | `DeleteSubEntities` | 识别面或边进行删除 |
| **ImprintSolidElementsTool** | `ImprintSolids` | 识别边或元素在实体或曲面上压印 |
| **RoundEdgesTool** | `RoundEdges` | 识别边应用滚球圆角 |
| **ChamferEdgesTool** | `ChamferEdges` | 识别边应用倒角 |
| **SweepFacesTool** | `SweepFaces` | 识别面进行平移 |
| **SpinFacesTool** | `SpinFaces` | 识别面进行旋转 |

**使用示例**:
```typescript
// 创建圆角
await IModelApp.tools.run("RoundEdges", {
  radius: 5.0,
  edges: selectedEdges
});

// 抽壳操作
await IModelApp.tools.run("HollowFaces", {
  thickness: 2.0,
  faces: selectedFaces
});
```

---

### 4.5 变换工具 (3个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **MoveElementsTool** | `MoveElements` | 移动元素 |
| **CopyElementsTool** | `CopyElements` | 复制元素（支持多份）|
| **RotateElementsTool** | `RotateElements` | 旋转元素 |
| **LinearPatternTool*** | `LinearPattern` | 线性阵列（基于 CopyElementsTool 扩展）|
| **CircularPatternTool*** | `CircularPattern` | 圆形阵列（基于 CopyElementsTool 扩展）|

> *注：带 * 号为 LubanCAD 自定义工具，继承 iTwin.js 标准工具类实现

---

### 4.6 删除和撤销工具 (4个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **DeleteElementsTool** | `DeleteElements` | 删除元素 |
| **UndoAllTool** | `UndoAll` | 撤销所有编辑操作 |
| **UndoTool** | `Undo` | 撤销上次编辑操作 |
| **RedoTool** | `Redo` | 重做上次撤销的操作 |

---

### 4.7 项目位置工具 (7个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **ProjectGeolocationPointTool** | `ProjectLocation.Geolocation.Point` | 通过识别已知位置定义项目地理位置 |
| **ProjectGeolocationNorthTool** | `ProjectLocation.Geolocation.North` | 定义项目北方向 |
| **ProjectGeolocationMoveTool** | `ProjectLocation.Geolocation.Move` | 移动项目地理位置 |
| **ProjectLocationShowTool** | `ProjectLocation.Show` | 显示项目位置装饰 |
| **ProjectLocationHideTool** | `ProjectLocation.Hide` | 隐藏项目位置装饰 |
| **ProjectLocationCancelTool** | `ProjectLocation.Cancel` | 取消项目位置更改 |
| **ProjectLocationSaveTool** | `ProjectLocation.Save` | 保存项目位置更改 |

---

## 五、Display-Test-App 工具

测试和演示应用工具，共 61 个。

### 5.1 测试演示工具 (6个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **IncidentMarkerDemoTool** | `ToggleIncidentMarkers` | 切换事故标记演示 |
| **DrawingAidTestTool** | `DrawingAidTest.Points` | 测试AccuDraw和AccuSnap |
| **MarkupTool** | `Markup` | 启动/停止标记模式 |
| **MarkupSelectTestTool** | `Markup.TestSelect` | 标记选择测试工具 |
| **PathDecorationTestTool** | `TogglePathDecoration` | 切换路径装饰测试 |
| **ToggleAspectRatioSkewDecoratorTool** | `ToggleAspectRatioSkewDecorator` | 切换纵横比倾斜装饰器 |

---

### 5.2 窗口管理工具 (8个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **CreateWindowTool** | `CreateWindow` | 创建新命名窗口 |
| **FocusWindowTool** | `FocusWindow` | 聚焦指定窗口 |
| **MaximizeWindowTool** | `MaximizeWindow` | 最大化窗口 |
| **RestoreWindowTool** | `RestoreWindow` | 恢复窗口 |
| **CloseWindowTool** | `CloseWindow` | 关闭窗口 |
| **ResizeWindowTool** | `ResizeWindow` | 调整窗口大小 |
| **DockWindowTool** | `DockWindow` | 停靠窗口 |
| **CloneViewportTool** | `CloneViewport` | 克隆当前视口 |

---

### 5.3 IModel 管理工具 (7个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **OpenIModelTool** | `OpenIModel` | 打开iModel文件 |
| **CloseIModelTool** | `CloseIModel` | 关闭所有iModel查看器 |
| **ReopenIModelTool** | `ReopenIModel` | 重新打开iModel |
| **PushChangesTool** | `PushChanges` | 推送更改 |
| **PullChangesTool** | `PullChanges` | 拉取更改 |
| **ShutDownTool** | `ShutDown` | 关闭应用程序 |
| **ExitTool** | `Exit` | 终止RPC连接 |

---

### 5.4 性能分析工具 (4个)

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **FrameStatsTool** | `FrameStats` | 启用/禁用帧统计报告 |
| **RecordFpsTool** | `RecordFps` | 记录FPS性能指标 |
| **RecordTileSizesTool** | `RecordTileSizes` | 记录瓦片大小到CSV |
| **OutputShadersTool** | `OutputShaders` | 输出着色器文件 |

---

### 5.5 其他重要工具

| 工具类名 | 工具 ID | 功能描述 |
|---------|---------|----------|
| **ZoomToSelectedElementsTool** | `ZoomToSelectedElements` | 缩放到选中元素 |
| **SyncViewportsTool** | `SyncViewports` | 连接/断开视口同步 |
| **SaveImageTool** | `SaveImage` | 保存视口为图像 |
| **GltfDecorationTool** | `AddGltfDecoration` | 从glTF创建装饰图形 |
| **TerrainDrapeTool** | `TerrainDrape` | 在地形上覆盖线串和多边形 |
| **DynamicClassifierTool** | `DtaClassify` | 使用球体对现实模型空间分类 |
| **CreateSectionDrawingTool** | `CreateSectionDrawing` | 创建立面图模型 |

---

## 六、Core/Markup 工具

SVG 标记和注释工具，共 13 个。

### 6.1 标注工具 (10个)

| 工具名称 | 类名 | 工具 ID | 图标 | 功能描述 |
|---------|------|---------|------|----------|
| **LineTool** | `LineTool` | `Markup.Line` | `icon-line` | 绘制直线段 |
| **RectangleTool** | `RectangleTool` | `Markup.Rectangle` | `icon-rectangle` | 绘制矩形 |
| **PolygonTool** | `PolygonTool` | `Markup.Polygon` | `icon-polygon` | 绘制多边形 |
| **CloudTool** | `CloudTool` | `Markup.Cloud` | `icon-cloud` | 绘制云形标记 |
| **CircleTool** | `CircleTool` | `Markup.Circle` | `icon-circle` | 绘制圆形 |
| **EllipseTool** | `EllipseTool` | `Markup.Ellipse` | `icon-ellipse` | 绘制椭圆 |
| **ArrowTool** | `ArrowTool` | `Markup.Arrow` | `icon-callout` | 绘制带箭头的线 |
| **DistanceTool** | `DistanceTool` | `Markup.Distance` | `icon-distance` | 测量距离并显示标注 |
| **SketchTool** | `SketchTool` | `Markup.Sketch` | `icon-draw` | 手绘草图工具 |
| **SymbolTool** | `SymbolTool` | `Markup.Symbol` | `icon-symbol` | 放置SVG符号 |

---

### 6.2 文本工具 (2个)

| 工具名称 | 类名 | 工具 ID | 图标 | 功能描述 |
|---------|------|---------|------|----------|
| **PlaceTextTool** | `PlaceTextTool` | `Markup.Text.Place` | `icon-text-medium` | 放置新文本注释 |
| **EditTextTool** | `EditTextTool` | `Markup.Text.Edit` | `icon-text-medium` | 编辑现有文本 |

---

### 6.3 选择工具

| 工具名称 | 类名 | 工具 ID | 图标 | 功能描述 |
|---------|------|---------|------|----------|
| **SelectTool** | `SelectTool` | `Markup.Select` | `icon-cursor` | 选择、移动、删除、排序工具 |

**SelectTool 功能**:
- **元素选择**: 单击、Ctrl+单击多选、框选
- **元素移动**: 拖拽，Shift+拖拽复制
- **元素删除**: Delete/Backspace 键
- **层级排序**: Alt+Shift+F (顶层), Alt+Shift+B (底层)
- **组合操作**: Ctrl+G (组合), Ctrl+U (解组)
- **编辑手柄**: 8方向拉伸、旋转、平移、顶点编辑

**使用示例**:
```typescript
import { MarkupApp } from "@itwin/core-markup";

// 初始化标记
await MarkupApp.start(vp);

// 运行标记工具
await IModelApp.tools.run("Markup.Line");

// 停止标记
const markupData = MarkupApp.stop();
```

---

## 七、工具继承层次结构

```
Tool (基类)
├── InteractiveTool
│   ├── PrimitiveTool (抽象)
│   │   ├── ElementSetTool (抽象)
│   │   │   ├── SelectionTool
│   │   │   ├── MeasureDistanceTool
│   │   │   ├── MeasureLocationTool
│   │   │   ├── MeasureAreaByPointsTool
│   │   │   └── MeasureElementTool (抽象)
│   │   │       ├── MeasureLengthTool
│   │   │       ├── MeasureAreaTool
│   │   │       └── MeasureVolumeTool
│   │   ├── ViewClipTool
│   │   │   ├── ViewClipClearTool
│   │   │   ├── ViewClipByPlaneTool
│   │   │   ├── ViewClipByShapeTool
│   │   │   ├── ViewClipByRangeTool
│   │   │   └── ViewClipByElementTool
│   │   ├── SetupCameraTool
│   │   ├── SetupWalkCameraTool
│   │   ├── InspectElementTool
│   │   └── MarkupTool (markup)
│   │       └── RedlineTool (抽象)
│   │           ├── LineTool
│   │           ├── RectangleTool
│   │           ├── PolygonTool
│   │           ├── CloudTool
│   │           ├── CircleTool
│   │           ├── EllipseTool
│   │           ├── ArrowTool
│   │           ├── DistanceTool
│   │           ├── SketchTool
│   │           └── SymbolTool
│   ├── ViewTool (抽象)
│   │   ├── ViewManip (抽象)
│   │   │   ├── PanViewTool
│   │   │   ├── RotateViewTool
│   │   │   ├── LookViewTool
│   │   │   ├── ScrollViewTool
│   │   │   ├── ZoomViewTool
│   │   │   ├── LookAndMoveTool
│   │   │   ├── WalkViewTool
│   │   │   ├── FlyViewTool
│   │   │   └── DefaultViewTouchTool
│   │   ├── FitViewTool
│   │   ├── StandardViewTool
│   │   ├── WindowAreaTool
│   │   ├── ViewUndoTool
│   │   ├── ViewRedoTool
│   │   └── ViewToggleCameraTool
│   ├── IdleTool
│   └── InputCollector (抽象)
│       └── AccuDrawShortcutsTool (抽象)
│           └── [25+ AccuDraw 工具]
├── PrimitiveTool (editor)
│   ├── CreateOrContinuePathTool (抽象)
│   │   ├── CreateLineStringTool
│   │   ├── CreateArcTool
│   │   ├── CreateCircleTool
│   │   ├── CreateEllipseTool
│   │   ├── CreateRectangleTool
│   │   └── CreateBCurveTool
│   ├── SolidPrimitiveTool (抽象)
│   │   ├── CreateSphereTool
│   │   ├── CreateCylinderTool
│   │   ├── CreateConeTool
│   │   ├── CreateBoxTool
│   │   └── CreateTorusTool
│   ├── ModifyCurveTool (抽象)
│   │   ├── OffsetCurveTool
│   │   ├── BreakCurveTool
│   │   ├── ExtendCurveTool
│   │   ├── RegionBooleanTool
│   │   ├── ExtrudeCurveTool
│   │   └── RevolveCurveTool
│   └── SolidModelingTool (抽象)
│       ├── BooleanOperationTool
│       │   ├── UniteSolidElementsTool
│       │   ├── SubtractSolidElementsTool
│       │   └── IntersectSolidElementsTool
│       ├── LocateSubEntityTool
│       │   ├── OffsetFacesTool
│       │   ├── HollowFacesTool
│       │   ├── DeleteSubEntitiesTool
│       │   ├── RoundEdgesTool
│       │   ├── ChamferEdgesTool
│       │   ├── SweepFacesTool
│       │   └── SpinFacesTool
│       └── [其他实体建模工具]
└── [其他直接继承 Tool 的工具类]
```

---

## 八、快速参考表

### 8.1 按类别统计

| 类别 | 数量 | 所在包 |
|------|------|--------|
| 视图导航 | 11 | core/frontend |
| 视图操作 | 8 | core/frontend |
| 测量 | 6 | core/frontend |
| 视图裁剪 | 6 | core/frontend |
| AccuDraw | 25+ | core/frontend |
| 选择 | 1 | core/frontend |
| 视口调试 | 19 | core/frontend-devtools |
| 地图图层 | 20 | core/frontend-devtools |
| 现实模型 | 10 | core/frontend-devtools |
| 元素强调 | 5 | core/frontend-devtools |
| 平面遮罩 | 12 | core/frontend-devtools |
| 视觉效果 | 16 | core/frontend-devtools |
| 渲染调试 | 15 | core/frontend-devtools |
| 草图 | 6 | editor/frontend |
| 实体基本体 | 5 | editor/frontend |
| 曲线修改 | 6 | editor/frontend |
| 实体建模 | 16 | editor/frontend |
| 变换 | 3 | editor/frontend |
| 删除/撤销 | 4 | editor/frontend |
| 项目位置 | 7 | editor/frontend |
| 测试演示 | 61 | display-test-app |
| 标记 | 13 | core/markup |
| **总计** | **约 300** | - |

### 8.2 常用快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Z` | 撤销 |
| `Ctrl + Y` | 重做 |
| `Ctrl + Home` | 适应视图 |
| `Ctrl + A` | 全选 |
| `Delete` | 删除选中 |
| `F5` | 刷新 |
| `Esc` | 取消当前工具 |
| `Space` | AccuDraw 智能锁定 |
| `X` / `Y` / `Z` | AccuDraw 锁定轴 |
| `O` | 设置 AccuDraw 原点 |

### 8.3 常用 API

```typescript
// 运行工具
await IModelApp.tools.run(toolId, ...args);

// 注册工具
IModelApp.tools.register(ToolClass, namespace);

// 获取工具实例
const tool = IModelApp.tools.find(toolId);

// 检查工具是否运行
const isRunning = IModelApp.tools.activeTool === toolInstance;
```

---

## 附录：文件位置参考

| 包 | 路径 |
|----|------|
| core/frontend | `/core/frontend/src/tools/` |
| core/frontend-devtools | `/core/frontend-devtools/src/` |
| editor/frontend | `/editor/frontend/src/` |
| test-apps/display-test-app | `/test-apps/display-test-app/src/` |
| core/markup | `/core/markup/src/` |

---

*文档版本: 1.0*  
*iTwin.js 版本: 5.x*  
*最后更新: 2026-04-08*
