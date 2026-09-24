# 实体创建工具集成方案

**预计工作量**: 2 天

**功能范围**: 创建立方体、圆柱、球体、圆锥、圆环等实体基本体

---

## 一、Hook 实现

```typescript
// features/solid-primitives/hooks/useSolidPrimitives.ts
import { useCallback, useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';

export type SolidPrimitiveType = 
  | 'box' 
  | 'cylinder' 
  | 'sphere' 
  | 'cone' 
  | 'torus';

export interface SolidPrimitiveParams {
  box: { width: number; height: number; depth: number };
  cylinder: { radius: number; height: number };
  sphere: { radius: number };
  cone: { baseRadius: number; topRadius: number; height: number };
  torus: { majorRadius: number; minorRadius: number };
}

export function useSolidPrimitives() {
  const [isCreating, setIsCreating] = useState(false);
  const [activeType, setActiveType] = useState<SolidPrimitiveType | null>(null);

  const createPrimitive = useCallback(async (
    type: SolidPrimitiveType,
    params?: Partial<SolidPrimitiveParams[typeof type]>
  ) => {
    setIsCreating(true);
    setActiveType(type);

    const toolMap: Record<SolidPrimitiveType, string> = {
      box: 'CreateBox',
      cylinder: 'CreateCylinder',
      sphere: 'CreateSphere',
      cone: 'CreateCone',
      torus: 'CreateTorus',
    };

    try {
      const success = await IModelApp.tools.run(toolMap[type], params);
      return success;
    } finally {
      setIsCreating(false);
      setActiveType(null);
    }
  }, []);

  return {
    isCreating,
    activeType,
    createPrimitive,
  };
}
```

---

## 二、参数对话框

```typescript
// features/solid-primitives/components/PrimitiveParamsDialog.tsx
import React from 'react';
import {
  Dialog,
  Input,
  Label,
  ButtonGroup,
} from '@itwin/itwinui-react';
import {
  SolidPrimitiveType,
  SolidPrimitiveParams,
} from '../hooks/useSolidPrimitives';

interface PrimitiveParamsDialogProps {
  isOpen: boolean;
  type: SolidPrimitiveType | null;
  onClose: () => void;
  onConfirm: (params: any) => void;
}

export const PrimitiveParamsDialog: React.FC<PrimitiveParamsDialogProps> = ({
  isOpen,
  type,
  onClose,
  onConfirm,
}) => {
  const [params, setParams] = useState({
    width: 100,
    height: 100,
    depth: 100,
    radius: 50,
    baseRadius: 50,
    topRadius: 0,
    majorRadius: 100,
    minorRadius: 30,
  });

  if (!type) return null;

  const renderFields = () => {
    switch (type) {
      case 'box':
        return (
          <>
            <Label>宽度 (X)</Label>
            <Input
              type="number"
              value={params.width}
              onChange={(e) => setParams(p => ({ ...p, width: Number(e.target.value) }))}
            />
            <Label>高度 (Y)</Label>
            <Input
              type="number"
              value={params.height}
              onChange={(e) => setParams(p => ({ ...p, height: Number(e.target.value) }))}
            />
            <Label>深度 (Z)</Label>
            <Input
              type="number"
              value={params.depth}
              onChange={(e) => setParams(p => ({ ...p, depth: Number(e.target.value) }))}
            />
          </>
        );
      case 'cylinder':
        return (
          <>
            <Label>半径</Label>
            <Input
              type="number"
              value={params.radius}
              onChange={(e) => setParams(p => ({ ...p, radius: Number(e.target.value) }))}
            />
            <Label>高度</Label>
            <Input
              type="number"
              value={params.height}
              onChange={(e) => setParams(p => ({ ...p, height: Number(e.target.value) }))}
            />
          </>
        );
      case 'sphere':
        return (
          <>
            <Label>半径</Label>
            <Input
              type="number"
              value={params.radius}
              onChange={(e) => setParams(p => ({ ...p, radius: Number(e.target.value) }))}
            />
          </>
        );
      // ... 其他类型
      default:
        return null;
    }
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`创建 ${typeLabels[type]}`}>
      <div className="primitive-params-form">
        {renderFields()}
      </div>
      <Dialog.ButtonGroup>
        <button onClick={onClose}>取消</button>
        <button
          onClick={() => onConfirm(params)}
          styleType="high-visibility"
        >
          创建
        </button>
      </Dialog.ButtonGroup>
    </Dialog>
  );
};

const typeLabels: Record<SolidPrimitiveType, string> = {
  box: '立方体',
  cylinder: '圆柱体',
  sphere: '球体',
  cone: '圆锥体',
  torus: '圆环体',
};
```

---

## 三、工具栏

```typescript
// features/solid-primitives/components/SolidPrimitivesToolbar.tsx
import React, { useState } from 'react';
import { IconButton, DropdownMenu, Tooltip } from '@itwin/itwinui-react';
import {
  SvgCube,
  SvgCylinder,
  SvgSphere,
  SvgCone,
  SvgTorus,
} from '@itwin/itwinui-icons-react';
import { SolidPrimitiveType } from '../hooks/useSolidPrimitives';
import { PrimitiveParamsDialog } from './PrimitiveParamsDialog';

interface SolidPrimitivesToolbarProps {
  onCreate: (type: SolidPrimitiveType, params?: any) => void;
  isCreating: boolean;
}

const primitives: Array<{ type: SolidPrimitiveType; label: string; icon: React.ReactNode }> = [
  { type: 'box', label: '立方体', icon: <SvgCube /> },
  { type: 'cylinder', label: '圆柱体', icon: <SvgCylinder /> },
  { type: 'sphere', label: '球体', icon: <SvgSphere /> },
  { type: 'cone', label: '圆锥体', icon: <SvgCone /> },
  { type: 'torus', label: '圆环体', icon: <SvgTorus /> },
];

export const SolidPrimitivesToolbar: React.FC<SolidPrimitivesToolbarProps> = ({
  onCreate,
  isCreating,
}) => {
  const [selectedType, setSelectedType] = useState<SolidPrimitiveType | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  const handleSelect = (type: SolidPrimitiveType) => {
    setSelectedType(type);
    setShowDialog(true);
  };

  const handleConfirm = (params: any) => {
    if (selectedType) {
      onCreate(selectedType, params);
    }
    setShowDialog(false);
    setSelectedType(null);
  };

  return (
    <>
      <div className="solid-primitives-toolbar">
        <DropdownMenu
          menuItems={(close) =>
            primitives.map(p => (
              <div
                key={p.type}
                className="primitive-menu-item"
                onClick={() => {
                  handleSelect(p.type);
                  close();
                }}
              >
                <span className="primitive-icon">{p.icon}</span>
                <span>{p.label}</span>
              </div>
            ))
          }
        >
          <IconButton
            title="创建实体"
            styleType={isCreating ? 'cta' : 'default'}
          >
            <SvgCube />
          </IconButton>
        </DropdownMenu>
      </div>

      <PrimitiveParamsDialog
        isOpen={showDialog}
        type={selectedType}
        onClose={() => setShowDialog(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
};
```

---

## 四、注册工具

```typescript
import {
  CreateBoxTool,
  CreateCylinderTool,
  CreateConeTool,
  CreateSphereTool,
  CreateTorusTool,
} from '@itwin/editor-frontend';

export function registerSolidPrimitiveTools(): void {
  IModelApp.tools.register(CreateBoxTool, 'solid');
  IModelApp.tools.register(CreateCylinderTool, 'solid');
  IModelApp.tools.register(CreateConeTool, 'solid');
  IModelApp.tools.register(CreateSphereTool, 'solid');
  IModelApp.tools.register(CreateTorusTool, 'solid');
}
```

---

## 五、集成

```typescript
// ViewerWithUI.tsx
import { useSolidPrimitives } from '../features/solid-primitives/hooks/useSolidPrimitives';
import { SolidPrimitivesToolbar } from '../features/solid-primitives/components/SolidPrimitivesToolbar';

export const ViewerWithUI: React.FC = () => {
  const { isCreating, createPrimitive } = useSolidPrimitives();

  return (
    <SolidPrimitivesToolbar
      onCreate={createPrimitive}
      isCreating={isCreating}
    />
  );
};
```
