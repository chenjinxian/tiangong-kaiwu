# AccuDraw 精确绘图系统集成方案

**预计工作量**: 1 天

**功能范围**: 精确输入、轴锁定、智能绘图辅助

---

## 一、概述

AccuDraw 是 iTwin.js 内置的精确绘图辅助系统，通过键盘快捷键提供类似 AutoCAD 的动态输入体验。

---

## 二、快捷键配置

### 2.1 默认快捷键映射

```typescript
// features/accudraw/config/accudraw-shortcuts.ts
export interface AccuDrawShortcut {
  key: string;
  toolId: string;
  description: string;
  category: 'origin' | 'axis' | 'rotation' | 'mode';
}

export const accuDrawShortcuts: AccuDrawShortcut[] = [
  // 原点设置
  { key: 'O', toolId: 'AccuDraw.SetOrigin', description: '设置 AccuDraw 原点', category: 'origin' },
  
  // 轴锁定
  { key: 'X', toolId: 'AccuDraw.LockX', description: '锁定 X 轴', category: 'axis' },
  { key: 'Y', toolId: 'AccuDraw.LockY', description: '锁定 Y 轴', category: 'axis' },
  { key: 'Z', toolId: 'AccuDraw.LockZ', description: '锁定 Z 轴', category: 'axis' },
  { key: 'D', toolId: 'AccuDraw.LockDistance', description: '锁定距离', category: 'axis' },
  { key: 'A', toolId: 'AccuDraw.LockAngle', description: '锁定角度', category: 'axis' },
  
  // 旋转
  { key: 'Q', toolId: 'AccuDraw.RotateCycle', description: '循环切换旋转模式', category: 'rotation' },
  { key: 'T', toolId: 'AccuDraw.RotateTop', description: '旋转到顶视图', category: 'rotation' },
  { key: 'F', toolId: 'AccuDraw.RotateFront', description: '旋转到前视图', category: 'rotation' },
  { key: 'S', toolId: 'AccuDraw.RotateSide', description: '旋转到侧视图', category: 'rotation' },
  { key: 'V', toolId: 'AccuDraw.RotateView', description: '旋转到视图方向', category: 'rotation' },
  
  // 模式切换
  { key: 'M', toolId: 'AccuDraw.ChangeMode', description: '切换极坐标/直角坐标', category: 'mode' },
  { key: 'Space', toolId: 'AccuDraw.LockSmart', description: '智能锁定', category: 'mode' },
];

// 组合快捷键
export const accuDrawCombos = [
  { keys: 'Shift+X', action: 'Unlock X', description: '解锁 X 轴' },
  { keys: 'Shift+Y', action: 'Unlock Y', description: '解锁 Y 轴' },
  { keys: 'Shift+Z', action: 'Unlock Z', description: '解锁 Z 轴' },
];
```

### 2.2 快捷键 Hook

```typescript
// features/accudraw/hooks/useAccuDrawShortcuts.ts
import { useEffect, useCallback } from 'react';
import { IModelApp } from '@itwin/core-frontend';
import { accuDrawShortcuts } from '../config/accudraw-shortcuts';

export function useAccuDrawShortcuts() {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // 如果正在输入文本，不触发快捷键
    if (event.target instanceof HTMLInputElement || 
        event.target instanceof HTMLTextAreaElement) {
      return;
    }
    
    const key = event.key.toUpperCase();
    const shortcut = accuDrawShortcuts.find(s => s.key === key);
    
    if (shortcut) {
      event.preventDefault();
      IModelApp.tools.run(shortcut.toolId);
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// 检查 AccuDraw 状态
export function useAccuDrawStatus() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  
  useEffect(() => {
    const checkStatus = () => {
      const accuDraw = IModelApp.accuDraw;
      if (accuDraw) {
        setIsEnabled(accuDraw.isEnabled);
        setIsSuspended(accuDraw.isSuspended);
      }
    };
    
    const interval = setInterval(checkStatus, 100);
    return () => clearInterval(interval);
  }, []);
  
  return { isEnabled, isSuspended };
}
```

---

## 三、UI 组件

### 3.1 AccuDraw 状态指示器

```typescript
// features/accudraw/components/AccuDrawIndicator.tsx
import React from 'react';
import { Badge, Tooltip } from '@itwin/itwinui-react';
import { useAccuDrawStatus } from '../hooks/useAccuDrawShortcuts';

export const AccuDrawIndicator: React.FC = () => {
  const { isEnabled, isSuspended } = useAccuDrawStatus();
  
  if (!isEnabled) {
    return (
      <Tooltip content="AccuDraw 未启用"
        <Badge color="subtle">AccuDraw: 关</Badge>
      </Tooltip>
    );
  }
  
  if (isSuspended) {
    return (
      <Tooltip content="AccuDraw 已暂停，按 Space 恢复"
        <Badge color="negative">AccuDraw: 暂停</Badge>
      </Tooltip>
    );
  }
  
  return (
    <Tooltip content="AccuDraw 运行中"
      <Badge color="positive">AccuDraw: 开</Badge>
    </Tooltip>
  );
};
```

### 3.2 快捷键帮助面板

```typescript
// features/accudraw/components/AccuDrawHelpPanel.tsx
import React from 'react';
import { Panel, Table, Text } from '@itwin/itwinui-react';
import { accuDrawShortcuts, accuDrawCombos } from '../config/accudraw-shortcuts';

export const AccuDrawHelpPanel: React.FC = () => {
  const columns = [
    { Header: '快捷键', accessor: 'key' },
    { Header: '功能', accessor: 'description' },
  ];
  
  return (
    <Panel className="accudraw-help-panel"
      <Panel.Header>
        <Text variant="subheading">AccuDraw 快捷键</Text>
      </Panel.Header>
      <Panel.Body>
        <h4>原点与轴</h4>
        <Table
          data={accuDrawShortcuts.filter(s => s.category === 'origin' || s.category === 'axis')}
          columns={columns}
        />
        
        <h4>旋转</h4>
        <Table
          data={accuDrawShortcuts.filter(s => s.category === 'rotation')}
          columns={columns}
        />
        
        <h4>模式切换</h4>
        <Table
          data={accuDrawShortcuts.filter(s => s.category === 'mode')}
          columns={columns}
        />
      </Panel.Body>
    </Panel>
  );
};
```

---

## 四、集成

### 4.1 初始化

```typescript
// features/editor/initializeAccuDraw.ts
import { IModelApp } from '@itwin/core-frontend';

export function initializeAccuDraw(): void {
  // 启用 AccuDraw 会话
  IModelApp.tools.run('AccuDraw.SessionToggle');
  
  console.log('[AccuDraw] Initialized');
}
```

### 4.2 添加到 Viewer

```typescript
// ViewerWithUI.tsx
import { useAccuDrawShortcuts } from '../features/accudraw/hooks/useAccuDrawShortcuts';
import { AccuDrawIndicator } from '../features/accudraw/components/AccuDrawIndicator';

export const ViewerWithUI: React.FC = () => {
  // 启用快捷键
  useAccuDrawShortcuts();
  
  return (
    <div className="viewer-with-ui"
      {/* 状态栏 */}
      <div className="status-bar"
        <AccuDrawIndicator />
      </div>
    </div>
  );
};
```

---

## 五、使用示例

### 绘制精确矩形

1. 启动 CreateRectangleTool
2. 点击第一点
3. 按 **X** 锁定 X 轴
4. 输入 `100` 按 Enter
5. 按 **Y** 锁定 Y 轴
6. 输入 `50` 按 Enter
7. 精确 100x50 的矩形绘制完成

### 极坐标输入

1. 按 **M** 切换到极坐标模式
2. 按 **D** 锁定距离
3. 输入 `100`
4. 按 **A** 锁定角度
5. 输入 `45`
6. 得到距离原点 100，角度 45° 的点
