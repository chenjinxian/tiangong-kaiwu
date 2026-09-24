# 视图裁剪工具集成方案

**预计工作量**: 1 天

**功能范围**: 剖面查看、平面裁剪、范围裁剪

---

## 一、功能概述

视图裁剪工具允许用户通过平面或形状来剖切 3D 模型，查看内部结构。

---

## 二、Hook 实现

```typescript
// features/view-clip/hooks/useViewClip.ts
import { useCallback, useState } from 'react';
import { IModelApp, ScreenViewport, ViewClipTool } from '@itwin/core-frontend';

export type ClipType = 'plane' | 'shape' | 'range' | 'element' | 'clear';

export interface ViewClipState {
  isClipped: boolean;
  clipType: ClipType | null;
  canEnable: boolean;
}

export function useViewClip() {
  const [state, setState] = useState<ViewClipState>({
    isClipped: false,
    clipType: null,
    canEnable: true,
  });

  const applyClip = useCallback(async (type: ClipType) => {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return;

    if (type === 'clear') {
      await IModelApp.tools.run('ViewClip.Clear');
      setState({ isClipped: false, clipType: null, canEnable: true });
      return;
    }

    const toolMap: Record<exclude ClipType, 'clear'>, string> = {
      plane: 'ViewClip.ByPlane',
      shape: 'ViewClip.ByShape',
      range: 'ViewClip.ByRange',
      element: 'ViewClip.ByElement',
    };

    const success = await IModelApp.tools.run(toolMap[type]);
    
    if (success) {
      setState({
        isClipped: true,
        clipType: type,
        canEnable: true,
      });
    }
  }, []);

  const toggleClip = useCallback(() => {
    const viewport = IModelApp.viewManager.selectedView;
    if (!viewport) return;

    const viewClip = viewport.view.getViewClip();
    
    if (viewClip) {
      // 已裁剪，清除
      applyClip('clear');
    } else {
      // 未裁剪，默认使用平面
      applyClip('plane');
    }
  }, [applyClip]);

  return {
    ...state,
    applyClip,
    toggleClip,
  };
}
```

---

## 三、UI 组件

```typescript
// features/view-clip/components/ViewClipToolbar.tsx
import React from 'react';
import { IconButton, DropdownMenu, Tooltip } from '@itwin/itwinui-react';
import {
  SvgSectionPlane,
  SvgSectionShape,
  SvgSectionRange,
  SvgElement,
  SvgClear,
} from '@itwin/itwinui-icons-react';
import { ClipType } from '../hooks/useViewClip';

interface ViewClipToolbarProps {
  isClipped: boolean;
  onApplyClip: (type: ClipType) => void;
}

const clipTools: Array<{ type: ClipType; label: string; icon: React.ReactNode }> = [
  { type: 'plane', label: '平面剖切', icon: <SvgSectionPlane /> },
  { type: 'shape', label: '形状剖切', icon: <SvgSectionShape /> },
  { type: 'range', label: '范围剖切', icon: <SvgSectionRange /> },
  { type: 'element', label: '元素剖切', icon: <SvgElement /> },
];

export const ViewClipToolbar: React.FC<ViewClipToolbarProps> = ({
  isClipped,
  onApplyClip,
}) => {
  return (
    <div className="view-clip-toolbar"
      <DropdownMenu
        menuItems={(close) => 
          <>
            {clipTools.map(tool => (
              <div
                key={tool.type}
                className="clip-menu-item"
                onClick={() => {
                  onApplyClip(tool.type);
                  close();
                }}
              
                <span className="clip-icon">{tool.icon}</span>
                <span>{tool.label}</span>
              </div>
            ))}
            <hr />
            <div
              className="clip-menu-item"
              onClick={() => {
                onApplyClip('clear');
                close();
              }}
            
              <span className="clip-icon"><SvgClear /></span>
              <span>清除剖切</span>
            </div>
          </>
        }
      
        <Tooltip content="剖切工具"
          <IconButton
            styleType={isClipped ? 'cta' : 'default'}
          
            <SvgSectionPlane />
          </IconButton>
        </Tooltip>
      </DropdownMenu>
      
      {isClipped && (
        <Tooltip content="清除剖切"
          <IconButton onClick={() => onApplyClip('clear')}
            <SvgClear />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
};
```

---

## 四、注册工具

```typescript
import {
  ViewClipClearTool,
  ViewClipByPlaneTool,
  ViewClipByShapeTool,
  ViewClipByRangeTool,
  ViewClipByElementTool,
} from '@itwin/core-frontend';

export function registerViewClipTools(): void {
  IModelApp.tools.register(ViewClipClearTool, 'view');
  IModelApp.tools.register(ViewClipByPlaneTool, 'view');
  IModelApp.tools.register(ViewClipByShapeTool, 'view');
  IModelApp.tools.register(ViewClipByRangeTool, 'view');
  IModelApp.tools.register(ViewClipByElementTool, 'view');
}
```

---

## 五、集成

```typescript
// ViewerWithUI.tsx
import { useViewClip } from '../features/view-clip/hooks/useViewClip';
import { ViewClipToolbar } from '../features/view-clip/components/ViewClipToolbar';

export const ViewerWithUI: React.FC = () => {
  const { isClipped, applyClip } = useViewClip();
  
  return (
    <ViewClipToolbar
      isClipped={isClipped}
      onApplyClip={applyClip}
    />
  );
};
```
