# Open Cloud CAD 工具集成文档

本文档说明 iTwin.js 工具在 Open Cloud CAD 中的集成状态。

---

## 集成状态概览

| 工具类别 | 状态 | 工具数量 | 说明 |
|----------|------|----------|------|
| **视图导航** | ✅ 完成 | 11 | 旋转、平移、缩放、适应视图 |
| **测量工具** | ✅ 完成 | 6 | 距离、面积、体积、长度、位置测量 |
| **视图裁剪** | ✅ 完成 | 6 | 平面/形状/范围剖切 |
| **AccuDraw** | ✅ 完成 | 25+ | 精确绘图辅助 |
| **标记工具** | ✅ 完成 | 13 | 线、矩形、圆、箭头、文字 |
| **实体建模** | ✅ 完成 | 16 | 圆角、倒角、抽壳、布尔运算等 |
| **草图工具** | ✅ 完成 | 6 | 线、弧、圆、矩形、B样条 |
| **变换工具** | ✅ 完成 | 3 | 移动、旋转、复制 |

---

## 工具注册

所有工具在 `features/editor/registerTools.ts` 中统一注册：

```typescript
// 视图工具
IModelApp.tools.register(SelectViewTool, 'view');
IModelApp.tools.register(RotateViewTool, 'view');
// ...

// 测量工具
IModelApp.tools.register(MeasureDistanceTool, 'measure');
// ...

// 标记工具
IModelApp.tools.register(LineTool, 'markup');
// ...
```

---

## 工具使用

通过 `IModelApp.tools.run()` 调用工具：

```typescript
// 启动测量工具
await IModelApp.tools.run('Measure.Distance');

// 启动标记工具
await IModelApp.tools.run('Markup.Line');
```

---

## 完整工具列表

详见 [iTwin.js 工具完整参考](./iTwin.js-Tools-Complete-Reference.md)

---

*所有工具已集成完成*
