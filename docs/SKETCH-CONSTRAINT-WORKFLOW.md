# 草图约束求解器 - 使用流程与数据存储设计

> 状态：设计稿（2026-04；2026-09-22 校对）——草图现状为自由绘制、未接约束服务（见 [ROADMAP.md](./ROADMAP.md) Phase 2）；MongoDB/SolveSpace WASM 均为本文设计提案，求解器选型一事一源归 platform-docs/KERNEL-STRATEGY.md。

## 核心概念

### 约束求解的本质

```
草图约束求解 ≠ 几何建模
                    ↓
草图约束求解 = 确定几何位置的"计算器"
                    ↓
BRep建模 = 基于确定的几何创建实体
```

**关键理解**: 约束求解器只负责算出"点应该在哪里"，不负责创建BRep几何。

---

## 标准使用流程

### 流程概述

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        草图约束工作流程                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Step 1: 创建草图平面                                                      │
│     │                                                                    │
│     ▼                                                                    │
│  Step 2: 绘制几何元素 (自由状态)                                           │
│     │  ├─ 点 (Point2d)                                                   │
│     │  ├─ 线 (LineSegment)                                               │
│     │  ├─ 圆 (Circle)                                                    │
│     │  └─ 弧 (Arc)                                                       │
│     │                                                                    │
│     ▼                                                                    │
│  Step 3: 添加约束                                                          │
│     │  ├─ 几何约束 (重合/平行/垂直/相切等)                                 │
│     │  └─ 尺寸约束 (距离/角度/半径)                                        │
│     │                                                                    │
│     ▼                                                                    │
│  Step 4: 求解                                                              │
│     │  ├─ 输入: 几何初始位置 + 约束方程                                    │
│     │  ├─ 处理: 求解器计算满足约束的位置                                   │
│     │  └─ 输出: 新的几何坐标                                               │
│     │                                                                    │
│     ▼                                                                    │
│  Step 5: 更新几何显示                                                      │
│     │  └─ 将求解结果应用到视图                                            │
│     │                                                                    │
│     ▼                                                                    │
│  Step 6: 用于建模 (拉伸/旋转等)                                            │
│         └─ 确定的几何 → BRep创建 → 实体建模                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 详细步骤说明

#### Step 1: 创建草图平面

```typescript
// iTwin.js 中创建草图
const sketchPlane = Plane3d.createOriginNormal(
  Point3d.create(0, 0, 0),  // 原点
  Vector3d.unitZ()           // 法向 (Z轴)
);
```

#### Step 2: 绘制几何元素

```typescript
// 在自由状态下绘制几何
// 此时位置是"临时"的，可能不满足约束

const sketch = {
  points: [
    { id: 'p1', x: 0, y: 0 },    // 初始位置，可能不准确
    { id: 'p2', x: 100, y: 0 },
    { id: 'p3', x: 50, y: 80 }
  ],
  lines: [
    { id: 'l1', start: 'p1', end: 'p2' },
    { id: 'l2', start: 'p2', end: 'p3' },
    { id: 'l3', start: 'p3', end: 'p1' }
  ]
};
```

#### Step 3: 定义约束

```typescript
// 约束定义独立于几何
const constraints = {
  geometric: [
    { type: 'fix', element: 'p1' },                    // p1固定
    { type: 'horizontal', elements: ['l1'] },          // l1水平
    { type: 'equal', elements: ['l2', 'l3'] }          // l2=l3
  ],
  dimensional: [
    { type: 'distance', elements: ['p1', 'p2'], value: 100 },  // 距离100
    { type: 'angle', elements: ['l1', 'l2'], value: 60 }       // 角度60°
  ]
};
```

#### Step 4: 求解

```typescript
// 调用约束求解器
const solver = new ConstraintSolver();

// 求解流程
const result = solver.solve({
  geometry: sketch,           // 当前几何
  constraints: constraints,   // 约束定义
  parameters: {              // 求解参数
    maxIterations: 100,
    tolerance: 1e-6
  }
});

// 结果
if (result.status === 'ok') {
  // 求解成功，获得新的坐标
  const solvedGeometry = result.geometry;
  // p1: (0, 0)
  // p2: (100, 0)
  // p3: (100 + 50*cos(60°), 50*sin(60°)) = (125, 43.3)
} else {
  // 求解失败，需要调整约束
  console.error('约束冲突:', result.error);
}
```

#### Step 5: 更新显示

```typescript
// 将求解结果应用到 iTwin.js
for (const point of solvedGeometry.points) {
  const element = imodel.elements.getElement(point.id);
  element.geom.origin = Point3d.create(point.x, point.y, 0);
  await imodel.elements.updateElement(element);
}

// 视图自动更新
viewport.invalidateDecorations();
```

#### Step 6: 用于实体建模

```typescript
// 草图确定后，用于创建BRep实体
const extrudeParams = {
  profile: solvedGeometry,      // 使用确定后的草图
  direction: Vector3d.unitZ(),
  depth: 50
};

// iTwin.js 使用 Parasolid 创建拉伸体
const solid = await createExtrudedBody(extrudeParams);
```

---

## 数据存储设计

### 核心问题: 约束数据存哪里？

```
选项A: 与BRep一起存储 (iModel中)
选项B: 单独存储 (MongoDB等)
选项C: 混合存储
```

### 推荐方案: 混合存储

```
┌──────────────────────────────────────────────────────────────┐
│                     数据存储架构                              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  iModel (Parasolid BRep)              MongoDB               │
│  ┌─────────────────────────┐          ┌──────────────────┐  │
│  │  Element: Extrusion     │          │  Feature Tree    │  │
│  │  ├─ geometry: BRep      │          │  ├─ Sketch.1     │  │
│  │  └─ category: Geometry  │◀─────────│  │   ├─ points   │  │
│  │                         │  ref     │  │   ├─ lines    │  │
│  └─────────────────────────┘          │  │   └─ constraints│ │
│                                       │  │                 │  │
│  ┌─────────────────────────┐          │  ├─ Extrude.1    │  │
│  │  Element: Line          │◀─────────│  │   ├─ depth=50 │  │
│  │  ├─ start: (0,0,0)      │  ref     │  │   └─ profile  │──┤
│  │  └─ end: (100,0,0)      │          │  │               │  │
│  └─────────────────────────┘          │  └─ Fillet.1     │  │
│                                       │                  │  │
│  BRep几何 (二进制)                     │  约束+参数 (JSON) │  │
│  - 精确的边界面                        │                  │  │
│  - 用于渲染和建模                      │  - 可编辑的历史   │  │
│  - 不可直接修改                        │  - 支持重生成     │  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 为什么这样设计？

#### 1. BRep 存 iModel 的原因

```
优点:
✅ iTwin.js 原生支持，渲染、选择、测量都基于 BRep
✅ Parasolid 格式精确，适合制造
✅ 与外部系统互操作 (IFC/STEP导出)
✅ 版本控制内置 (Changeset)

缺点:
❌ BRep 是"结果"，丢失了"如何创建"的信息
❌ 不能直接修改参数 (需要重生成)
```

#### 2. 约束存 MongoDB 的原因

```
优点:
✅ 灵活的结构 (JSON Schema)
✅ 快速读写约束定义
✅ 支持复杂查询 (找所有用到某参数的草图)
✅ 易于备份和迁移

缺点:
❌ 需要维护与 BRep 的关联
❌ 数据一致性需要应用层保证
```

### 数据结构详细设计

#### iModel 中的 BRep 数据

```typescript
// 标准的 iTwin.js Element
interface SketchElement extends GeometricElement2d {
  // 几何数据 (BRep)
  geom: {
    curves: CurveCollection;
    // 注意: 这里存的是"求解后的"几何位置
  };
  
  // 自定义属性 - 关联到外部约束数据
  jsonProperties: {
    openCloudCad: {
      sketchId: string;           // 引用 MongoDB 中的约束定义
      featureId: string;          // 属于哪个 Feature
      version: number;            // 约束版本号
    }
  };
}
```

#### MongoDB 中的约束数据

```typescript
// Sketch 定义 (约束 + 参数)
interface SketchDefinition {
  _id: string;                    // sketchId
  name: string;                   // "Sketch.1"
  
  // 所属关系
  documentId: string;             // 哪个文档
  featureId: string;              // 哪个特征 (如果是独立草图)
  
  // 平面定义
  plane: {
    origin: { x: number, y: number, z: number };
    normal: { x: number, y: number, z: number };
  };
  
  // 几何定义 (拓扑结构，不含具体坐标)
  geometry: {
    points: Array<{
      id: string;
      // 注意: 不存 x,y，由求解器计算
    }>;
    lines: Array<{
      id: string;
      start: string;  // point id
      end: string;    // point id
    }>;
    circles: Array<{
      id: string;
      center: string; // point id
      radius: number; // 可以是参数引用
    }>;
    arcs: Array<{
      id: string;
      center: string;
      radius: number;
      startAngle: number;
      endAngle: number;
    }>;
  };
  
  // 约束定义
  constraints: {
    geometric: Array<{
      id: string;
      type: 'coincident' | 'horizontal' | 'vertical' | 
            'parallel' | 'perpendicular' | 'tangent' | 
            'equal' | 'symmetric' | 'fix' | 'collinear';
      elements: string[];  // 元素ID
      params?: any;        // 额外参数
    }>;
    
    dimensional: Array<{
      id: string;
      type: 'distance' | 'angle' | 'radius' | 'diameter';
      elements: string[];
      value: {
        expression?: string;  // 如 "#width / 2"
        value?: number;       // 计算后的值
        unit: 'mm' | 'cm' | 'm' | 'in';
      };
    }>;
  };
  
  // 求解状态 (缓存)
  solvedState?: {
    positions: Map<string, { x: number; y: number }>;  // point id -> position
    timestamp: Date;
    solverVersion: string;
  };
  
  // 版本控制
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
```

#### 关联关系

```typescript
// Feature Tree 中的引用
interface ExtrudeFeature {
  id: string;
  type: 'extrude';
  name: 'Extrude.1';
  
  parameters: {
    profile: {
      type: 'sketch';
      sketchId: string;        // 引用 MongoDB
      imodelElementId: string; // 引用 iModel (用于快速渲染)
    };
    direction: Vector3d;
    depth: ParameterValue;
  };
}
```

---

## 完整工作流程 (含数据流)

### 场景: 用户创建带约束的草图并拉伸

```
┌────────────────────────────────────────────────────────────────────────┐
│                         完整工作流程                                    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. 用户创建草图                                                         │
│     ├── UI: 点击 "新建草图"                                             │
│     ├── Frontend: POST /api/sketches                                    │
│     ├── Backend: 创建 SketchDefinition (MongoDB)                         │
│     └── 返回: sketchId                                                  │
│                                                                         │
│  2. 用户绘制几何                                                         │
│     ├── UI: 使用 iTwin.js 工具绘制                                      │
│     ├── Frontend: 临时存储几何位置                                       │
│     └── 显示: iTwin.js 渲染 (此时无约束)                                 │
│                                                                         │
│  3. 用户添加约束                                                         │
│     ├── UI: 选择元素 → 点击约束按钮                                      │
│     ├── Frontend: POST /api/sketches/{id}/constraints                   │
│     ├── Backend: 更新 SketchDefinition.constraints                       │
│     └── MongoDB: 保存约束定义                                            │
│                                                                         │
│  4. 触发求解                                                             │
│     ├── Frontend: 调用 WASM Solver (浏览器)                              │
│     │   └── 输入: geometry + constraints                                 │
│     ├── WASM: 求解计算                                                   │
│     └── 输出: 新的坐标位置                                               │
│                                                                         │
│  5. 更新显示                                                             │
│     ├── Frontend: 更新 iTwin.js Element 位置                             │
│     ├── iTwin.js: 重新渲染草图                                           │
│     └── 用户: 看到约束后的几何                                           │
│                                                                         │
│  6. 保存求解结果                                                          │
│     ├── Frontend: POST /api/sketches/{id}/solve                         │
│     ├── Backend:                                                        │
│     │   ├── 更新 SketchDefinition.solvedState (MongoDB)                  │
│     │   └── 更新 iModel Element 位置 (iTwin.js)                          │
│     └── 完成: 草图确定                                                    │
│                                                                         │
│  7. 用户执行拉伸 (Extrude)                                               │
│     ├── UI: 选择草图 → 点击 "拉伸"                                       │
│     ├── Frontend: POST /api/features                                    │
│     ├── Backend:                                                        │
│     │   ├── 创建 Feature 定义 (MongoDB)                                  │
│     │   └── 使用 iTwin.js 创建 BRep 实体                                 │
│     │       └── 调用 Parasolid API: createExtrudedBody()                 │
│     ├── iModel: 存储 BRep 几何 (二进制)                                  │
│     └── 显示: 3D 实体模型                                                │
│                                                                         │
│  8. 后续修改参数                                                         │
│     ├── UI: 双击 Feature 编辑深度                                        │
│     ├── Frontend: PUT /api/features/{id}                                │
│     ├── Backend:                                                         │
│     │   ├── 更新参数 (MongoDB)                                           │
│     │   ├── 重生成: 重新调用 Parasolid                                   │
│     │   └── 更新 iModel                                                  │
│     └── 显示: 模型更新                                                   │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 利用 Parasolid 的能力

### iTwin.js + Parasolid 的优势

```typescript
// iTwin.js 内部使用 Parasolid 作为几何内核
// 提供了高性能的 BRep 操作

// 1. 快速创建几何
const profile = await createProfileFromSketch(sketch);  // 从草图创建截面
const body = await parasolid.extrude({
  profile: profile,
  direction: [0, 0, 1],
  distance: 50
});  // 毫秒级完成

// 2. 布尔运算
const tool = await createToolBody();
const result = await parasolid.boolean({
  target: body,
  tool: tool,
  operation: 'subtract'
});

// 3. 分析查询
const massProps = await parasolid.calculateMassProperties(body);
console.log(massProps.volume, massProps.centerOfGravity);

// 4. 几何修复
const healed = await parasolid.healBody(body);
```

### 约束求解与 Parasolid 的关系

```
约束求解器 (SolveSpace)          Parasolid (iTwin.js)
        │                              │
        │  求解后坐标                   │  创建BRep
        ▼                              ▼
   ┌──────────┐                  ┌────────────┐
   │ 2D草图    │  ─────────────▶  │ Wire/Loop  │
   │ 点的位置  │                  │ Face       │
   └──────────┘                  └────────────┘
                                        │
                                        ▼
                                 ┌────────────┐
                                 │ Solid Body │
                                 │ (BRep)     │
                                 └────────────┘
```

**关键理解**:
- 约束求解器只管 2D 草图的点在哪里
- Parasolid 用这些点创建精确的 BRep 实体
- 两者是"前后工序"关系，不是替代关系

---

## 实际代码示例

### 完整的服务端求解流程

```typescript
// apps/backend/src/sketch/SketchSolverService.ts

import { SolveSpaceWASM } from './solvers/SolveSpaceWASM';
import { SketchDefinition } from '../models/SketchDefinition';

export class SketchSolverService {
  private solver = new SolveSpaceWASM();

  async solve(sketchDef: SketchDefinition): Promise<SolveResult> {
    // 1. 转换为求解器格式
    const solverInput = this.convertToSolverFormat(sketchDef);
    
    // 2. 调用 WASM 求解
    const solverOutput = await this.solver.solve(solverInput);
    
    // 3. 处理结果
    if (solverOutput.status === 'ok') {
      // 更新求解状态
      sketchDef.solvedState = {
        positions: solverOutput.positions,
        timestamp: new Date(),
        solverVersion: '3.1'
      };
      
      // 保存到数据库
      await sketchDef.save();
      
      // 可选: 同步到 iModel (异步)
      this.syncToIModel(sketchDef, solverOutput);
      
      return {
        status: 'ok',
        positions: solverOutput.positions
      };
    } else {
      return {
        status: 'error',
        error: solverOutput.error,
        conflictConstraints: solverOutput.conflicts
      };
    }
  }
  
  private convertToSolverFormat(def: SketchDefinition): SolverInput {
    return {
      groups: [{
        id: 1,
        entities: def.geometry.points.map(p => ({
          type: 'point',
          id: p.id,
          x: def.solvedState?.positions[p.id]?.x ?? 0,
          y: def.solvedState?.positions[p.id]?.y ?? 0
        })),
        constraints: def.constraints.geometric.map(c => ({
          type: c.type,
          entities: c.elements
        }))
      }]
    };
  }
  
  private async syncToIModel(
    def: SketchDefinition, 
    result: SolverOutput
  ): Promise<void> {
    // 使用 iTwin.js API 更新 Element
    const imodel = await getIModel(def.documentId);
    
    for (const point of def.geometry.points) {
      const pos = result.positions[point.id];
      const element = await imodel.elements.getElement(point.id);
      
      // 更新几何位置
      element.geom.origin = Point3d.create(pos.x, pos.y, 0);
      await imodel.elements.updateElement(element);
    }
    
    // 保存变更
    await imodel.saveChanges(`Solve sketch ${def.name}`);
  }
}
```

### 前端集成

```typescript
// apps/web/features/sketch/hooks/useSketchConstraints.ts

import { useCallback, useState } from 'react';
import { useIModelConnection } from '@itwin/core-frontend';
import { SolveSpaceWasm } from '../solvers/solvespace-wasm';

export function useSketchConstraints(sketchId: string) {
  const [isSolving, setIsSolving] = useState(false);
  const connection = useIModelConnection();
  
  // 添加约束
  const addConstraint = useCallback(async (constraint: Constraint) => {
    // 保存约束到后端
    await fetch(`/api/sketches/${sketchId}/constraints`, {
      method: 'POST',
      body: JSON.stringify(constraint)
    });
    
    // 触发求解
    await solve();
  }, [sketchId]);
  
  // 求解
  const solve = useCallback(async () => {
    setIsSolving(true);
    
    try {
      // 获取当前草图定义
      const response = await fetch(`/api/sketches/${sketchId}`);
      const sketchDef = await response.json();
      
      // 使用 WASM 本地求解 (快速响应)
      const solver = await SolveSpaceWasm.load();
      const result = solver.solve(sketchDef);
      
      if (result.status === 'ok') {
        // 更新 iTwin.js 显示
        updateSketchGeometry(connection, sketchId, result.positions);
        
        // 后台保存
        await fetch(`/api/sketches/${sketchId}/solve`, {
          method: 'POST',
          body: JSON.stringify(result.positions)
        });
      } else {
        // 显示约束冲突
        showConstraintError(result.error);
      }
    } finally {
      setIsSolving(false);
    }
  }, [sketchId, connection]);
  
  return {
    addConstraint,
    solve,
    isSolving
  };
}
```

---

## 关键设计决策

### 1. 求解器放在哪里？

| 位置 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **浏览器 WASM** | 响应快、无网络延迟 | 包体积大 | ✅ 首选 |
| **后端服务** | 包小、可扩展 | 网络延迟 | 备选 |
| **混合** | 简单草图本地、复杂的上传 | 复杂 | 后期考虑 |

### 2. 什么时候求解？

| 时机 | 体验 | 性能 | 推荐 |
|------|------|------|------|
| **实时 (拖拽时)** | 最好 | 要求高 | ✅ 目标 |
| **释放鼠标后** | 好 | 中等 | 🟡 备选 |
| **手动触发** | 一般 | 低 | ❌ 不推荐 |

### 3. 求解失败怎么处理？

```typescript
// 策略1: 回滚到上次成功状态
if (result.status === 'error') {
  sketch.restoreLastGoodState();
  showError('约束冲突，已回滚');
}

// 策略2: 软约束 (允许轻微违反)
if (result.status === 'error') {
  const softResult = solver.solve({
    ...input,
    softConstraints: true  // 允许轻微违反
  });
  applySolution(softResult);
  showWarning('约束部分满足');
}

// 策略3: 标记冲突约束
if (result.status === 'error') {
  highlightConflictingConstraints(result.conflicts);
  showError('请调整标记的约束');
}
```

---

## 总结

### 核心要点

1. **分离关注点**:
   - 约束求解器 = 计算点的位置
   - BRep (Parasolid) = 基于点创建精确几何
   - 两者通过坐标传递数据

2. **分层存储**:
   - MongoDB: 存约束定义 + 参数 (可编辑)
   - iModel: 存 BRep 结果 (用于渲染)

3. **利用 Parasolid**:
   - 草图求解后，快速创建实体
   - 毫秒级完成拉伸/旋转等操作
   - 精确的 BRep 用于制造

4. **实时求解**:
   - WASM 方案可实现浏览器端求解
   - 拖拽时实时更新 (目标 < 50ms)

### 下一步

1. 验证 iTwin.js Sketch 的坐标获取/更新能力
2. 编译 SolveSpace WASM，测试性能
3. 设计具体的 API 接口

需要我详细展开哪个部分？
