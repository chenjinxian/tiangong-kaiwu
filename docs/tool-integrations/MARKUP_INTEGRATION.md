# Markup 标记系统完整集成方案

**预计工作量**: 2-3 天

**功能范围**: 红线批注、审阅、测量标注

---

## 一、架构设计

### 1.1 状态管理

```typescript
// features/markup/hooks/useMarkupManager.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { MarkupApp, MarkupData, SvgMarkup } from '@itwin/core-markup';
import { ScreenViewport, ViewState } from '@itwin/core-frontend';

export type MarkupToolType = 
  | 'line' 
  | 'rectangle' 
  | 'circle' 
  | 'ellipse'
  | 'arrow' 
  | 'cloud'
  | 'polygon'
  | 'sketch'
  | 'text'
  | 'distance'
  | 'symbol';

export interface MarkupSession {
  id: string;
  name: string;
  author: string;
  createdAt: number;
  data: MarkupData;
  isActive: boolean;
}

export function useMarkupManager(viewport: ScreenViewport | null) {
  const [activeSession, setActiveSession] = useState<MarkupSession | null>(null);
  const [sessions, setSessions] = useState<MarkupSession[]>([]);
  const [activeTool, setActiveTool] = useState<MarkupToolType | null>(null);
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  
  const currentSvgRef = useRef<SvgMarkup | null>(null);

  // 启动标记会话
  const startSession = useCallback(async (name: string) => {
    if (!viewport) return;
    
    await MarkupApp.start(viewport);
    currentSvgRef.current = MarkupApp.markup;
    
    const newSession: MarkupSession = {
      id: `markup_${Date.now()}`,
      name,
      author: 'current_user', // 从 UserContext 获取
      createdAt: Date.now(),
      data: { svg: '', decorations: [] },
      isActive: true,
    };
    
    setActiveSession(newSession);
    setSessions(prev => [...prev, newSession]);
  }, [viewport]);

  // 停止标记会话
  const stopSession = useCallback(() => {
    if (!activeSession) return;
    
    const data = MarkupApp.stop();
    
    setSessions(prev => prev.map(s => 
      s.id === activeSession.id 
        ? { ...s, data, isActive: false }
        : s
    ));
    setActiveSession(null);
    setActiveTool(null);
    currentSvgRef.current = null;
  }, [activeSession]);

  // 运行标记工具
  const runTool = useCallback(async (tool: MarkupToolType) => {
    if (!activeSession) {
      await startSession(`标记 ${new Date().toLocaleTimeString()}`);
    }
    
    const toolMap: Record<MarkupToolType, string> = {
      line: 'Markup.Line',
      rectangle: 'Markup.Rectangle',
      circle: 'Markup.Circle',
      ellipse: 'Markup.Ellipse',
      arrow: 'Markup.Arrow',
      cloud: 'Markup.Cloud',
      polygon: 'Markup.Polygon',
      sketch: 'Markup.Sketch',
      text: 'Markup.Text.Place',
      distance: 'Markup.Distance',
      symbol: 'Markup.Symbol',
    };
    
    await IModelApp.tools.run(toolMap[tool]);
    setActiveTool(tool);
  }, [activeSession, startSession]);

  // 加载历史会话
  const loadSession = useCallback(async (session: MarkupSession) => {
    if (!viewport) return;
    
    // 停止当前会话
    if (activeSession) {
      stopSession();
    }
    
    // 启动并加载数据
    await MarkupApp.start(viewport);
    
    // 恢复标记数据
    if (session.data.svg) {
      MarkupApp.markup?.load(session.data.svg);
    }
    
    setActiveSession({ ...session, isActive: true });
  }, [viewport, activeSession, stopSession]);

  // 删除会话
  const deleteSession = useCallback((id: string) => {
    if (activeSession?.id === id) {
      stopSession();
    }
    setSessions(prev => prev.filter(s => s.id !== id));
  }, [activeSession, stopSession]);

  // 导出 SVG
  const exportSvg = useCallback(() => {
    if (!activeSession) return '';
    return MarkupApp.markup?.svg?.outerHTML || '';
  }, [activeSession]);

  // 保存到后端
  const saveSession = useCallback(async () => {
    if (!activeSession) return;
    
    const data = MarkupApp.markup?.svg?.outerHTML || '';
    
    // 调用 API 保存
    await fetch(`/api/imodels/${iModelId}/markups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: activeSession.id,
        name: activeSession.name,
        svgData: data,
      }),
    });
  }, [activeSession]);

  return {
    activeSession,
    sessions,
    activeTool,
    selectedElements,
    startSession,
    stopSession,
    runTool,
    loadSession,
    deleteSession,
    exportSvg,
    saveSession,
  };
}
```

### 1.2 工具栏组件

```typescript
// features/markup/components/MarkupToolbar.tsx
import React from 'react';
import {
  IconButton,
  ButtonGroup,
  Tooltip,
  Dialog,
  Input,
} from '@itwin/itwinui-react';
import {
  SvgLine,
  SvgRectangle,
  SvgCircle,
  SvgText,
  SvgArrowRight,
  SvgCloud,
  SvgPolygon,
  SvgDraw,
  SvgSymbol,
  SvgDistance,
  SvgMore,
} from '@itwin/itwinui-icons-react';
import { MarkupToolType } from '../hooks/useMarkupManager';

interface MarkupToolbarProps {
  activeTool: MarkupToolType | null;
  isActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onToolSelect: (tool: MarkupToolType) => void;
  onSave: () => void;
  onExport: () => void;
}

const tools: Array<{ type: MarkupToolType; icon: React.ReactNode; label: string }> = [
  { type: 'line', icon: <SvgLine />, label: '直线' },
  { type: 'rectangle', icon: <SvgRectangle />, label: '矩形' },
  { type: 'circle', icon: <SvgCircle />, label: '圆形' },
  { type: 'ellipse', icon: <SvgCircle />, label: '椭圆' },
  { type: 'arrow', icon: <SvgArrowRight />, label: '箭头' },
  { type: 'cloud', icon: <SvgCloud />, label: '云线' },
  { type: 'polygon', icon: <SvgPolygon />, label: '多边形' },
  { type: 'sketch', icon: <SvgDraw />, label: '手绘' },
  { type: 'text', icon: <SvgText />, label: '文字' },
  { type: 'distance', icon: <SvgDistance />, label: '距离标注' },
  { type: 'symbol', icon: <SvgSymbol />, label: '符号' },
];

export const MarkupToolbar: React.FC<MarkupToolbarProps> = ({
  activeTool,
  isActive,
  onStart,
  onStop,
  onToolSelect,
  onSave,
  onExport,
}) => {
  const [showNameDialog, setShowNameDialog] = React.useState(false);
  const [sessionName, setSessionName] = React.useState('');

  if (!isActive) {
    return (
      <div className="markup-toolbar-inactive">
        <IconButton
          title="启动标记模式"
          onClick={() => setShowNameDialog(true)}
          styleType="high-visibility"
        >
          <SvgDraw />
        </IconButton>
        
        <Dialog
          isOpen={showNameDialog}
          onClose={() => setShowNameDialog(false)}
          title="新建标记会话"
        >
          <Input
            value={sessionName}
            onChange={setSessionName}
            placeholder="输入会话名称"
          />
          <Dialog.ButtonGroup>
            <button
              onClick={() => {
                onStart();
                setShowNameDialog(false);
                setSessionName('');
              }}
            >
              开始标记
            </button>
          </Dialog.ButtonGroup>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="markup-toolbar-active">
      <ButtonGroup>
        {tools.map(tool => (
          <Tooltip key={tool.type} content={tool.label}>
            <IconButton
              styleType={activeTool === tool.type ? 'cta' : 'default'}
              onClick={() => onToolSelect(tool.type)}
            >
              {tool.icon}
            </IconButton>
          </Tooltip>
        ))}
      </ButtonGroup>
      
      <div className="markup-actions">
        <IconButton title="保存" onClick={onSave}>
          <SvgSave />
        </IconButton>
        <IconButton title="导出 SVG" onClick={onExport}>
          <SvgExport />
        </IconButton>
        <IconButton title="退出标记模式" onClick={onStop} styleType="high-visibility">
          <SvgClose />
        </IconButton>
      </div>
    </div>
  );
};
```

### 1.3 历史会话面板

```typescript
// features/markup/components/MarkupSessionsPanel.tsx
import React from 'react';
import {
  Panel,
  List,
  ListItem,
  IconButton,
  Text,
  Badge,
} from '@itwin/itwinui-react';
import {
  SvgPlay,
  SvgDelete,
  SvgDownload,
} from '@itwin/itwinui-icons-react';
import { MarkupSession } from '../hooks/useMarkupManager';

interface MarkupSessionsPanelProps {
  sessions: MarkupSession[];
  activeId: string | null;
  onLoad: (session: MarkupSession) => void;
  onDelete: (id: string) => void;
  onExport: (session: MarkupSession) => void;
}

export const MarkupSessionsPanel: React.FC<MarkupSessionsPanelProps> = ({
  sessions,
  activeId,
  onLoad,
  onDelete,
  onExport,
}) => {
  return (
    <Panel className="markup-sessions-panel">
      <Panel.Header>
        <Text variant="subheading">标记历史</Text>
        <Badge>{sessions.length}</Badge>
      </Panel.Header>
      
      <Panel.Body>
        <List>
          {sessions.map(session => (
            <ListItem
              key={session.id}
              active={session.id === activeId}
              className="markup-session-item"
            >
              <div className="session-info">
                <Text fontWeight={600}>{session.name}</Text>
                <Text size="small" color="subtext">
                  {session.author} · {new Date(session.createdAt).toLocaleDateString()}
                </Text>
                {session.isActive && (
                  <Badge color="positive">进行中</Badge>
                )}
              </div>
              
              <div className="session-actions">
                <IconButton
                  size="small"
                  title="加载"
                  onClick={() => onLoad(session)}
                  disabled={session.id === activeId}
                >
                  <SvgPlay />
                </IconButton>
                <IconButton
                  size="small"
                  title="导出"
                  onClick={() => onExport(session)}
                >
                  <SvgDownload />
                </IconButton>
                <IconButton
                  size="small"
                  title="删除"
                  onClick={() => onDelete(session.id)}
                >
                  <SvgDelete />
                </IconButton>
              </div>
            </ListItem>
          ))}
        </List>
      </Panel.Body>
    </Panel>
  );
};
```

### 1.4 样式

```scss
// features/markup/styles/markup.scss
.markup-toolbar-active {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: var(--iui-color-background);
  border-bottom: 1px solid var(--iui-color-border);
  
  .markup-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
}

.markup-sessions-panel {
  width: 280px;
  
  .markup-session-item {
    .session-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    .session-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    &:hover .session-actions {
      opacity: 1;
    }
  }
}

// 标记激活时的特殊样式
.viewer-markup-mode {
  .markup-cursor {
    cursor: crosshair;
  }
}
```

---

## 二、集成步骤

### 2.1 注册 Markup 工具

```typescript
// features/editor/registerTools.ts
import {
  LineTool,
  RectangleTool,
  CircleTool,
  EllipseTool,
  ArrowTool,
  CloudTool,
  PolygonTool,
  SketchTool,
  PlaceTextTool,
  DistanceTool,
  SymbolTool,
  SelectTool as MarkupSelectTool,
} from '@itwin/core-markup';

export function registerMarkupTools(): void {
  IModelApp.tools.register(LineTool, 'markup');
  IModelApp.tools.register(RectangleTool, 'markup');
  IModelApp.tools.register(CircleTool, 'markup');
  IModelApp.tools.register(EllipseTool, 'markup');
  IModelApp.tools.register(ArrowTool, 'markup');
  IModelApp.tools.register(CloudTool, 'markup');
  IModelApp.tools.register(PolygonTool, 'markup');
  IModelApp.tools.register(SketchTool, 'markup');
  IModelApp.tools.register(PlaceTextTool, 'markup');
  IModelApp.tools.register(DistanceTool, 'markup');
  IModelApp.tools.register(SymbolTool, 'markup');
  IModelApp.tools.register(MarkupSelectTool, 'markup');
}
```

### 2.2 添加到 Viewer

```typescript
// luban-cad/packages/viewer-core/src/components/ViewerWithUI.tsx
import { useMarkupManager } from '../features/markup/hooks/useMarkupManager';
import { MarkupToolbar } from '../features/markup/components/MarkupToolbar';
import { MarkupSessionsPanel } from '../features/markup/components/MarkupSessionsPanel';

export const ViewerWithUI: React.FC = (props) => {
  const viewport = useViewport(); // 获取 viewport
  
  const {
    activeSession,
    sessions,
    activeTool,
    startSession,
    stopSession,
    runTool,
    loadSession,
    deleteSession,
    exportSvg,
    saveSession,
  } = useMarkupManager(viewport);
  
  return (
    <div className="viewer-with-ui">
      {/* 标记工具栏 */}
      <MarkupToolbar
        activeTool={activeTool}
        isActive={!!activeSession}
        onStart={() => startSession(`标记 ${new Date().toLocaleTimeString()}`)}
        onStop={stopSession}
        onToolSelect={runTool}
        onSave={saveSession}
        onExport={() => {
          const svg = exportSvg();
          downloadFile(svg, 'markup.svg', 'image/svg+xml');
        }}
      />
      
      {/* 标记历史面板 */}
      <MarkupSessionsPanel
        sessions={sessions}
        activeId={activeSession?.id || null}
        onLoad={loadSession}
        onDelete={deleteSession}
        onExport={(session) => {
          downloadFile(session.data.svg, `${session.name}.svg`, 'image/svg+xml');
        }}
      />
    </div>
  );
};
```

---

## 三、后端 API

```typescript
// modeling-server/src/routes/markup.ts
import { Router } from 'express';
import { db } from '../db';

const router = Router();

// 保存标记会话
router.post('/api/imodels/:iModelId/markups', async (req, res) => {
  const { iModelId } = req.params;
  const { sessionId, name, svgData } = req.body;
  
  await db.query(
    'INSERT INTO markups (id, i_model_id, name, svg_data, created_at) VALUES ($1, $2, $3, $4, NOW())',
    [sessionId, iModelId, name, svgData]
  );
  
  res.json({ success: true });
});

// 获取标记列表
router.get('/api/imodels/:iModelId/markups', async (req, res) => {
  const { iModelId } = req.params;
  
  const result = await db.query(
    'SELECT * FROM markups WHERE i_model_id = $1 ORDER BY created_at DESC',
    [iModelId]
  );
  
  res.json({ markups: result.rows });
});

// 删除标记
router.delete('/api/markups/:markupId', async (req, res) => {
  const { markupId } = req.params;
  await db.query('DELETE FROM markups WHERE id = $1', [markupId]);
  res.json({ success: true });
});

export default router;
```

---

## 四、数据库 Schema

```sql
-- markups 表
CREATE TABLE markups (
  id UUID PRIMARY KEY,
  i_model_id UUID REFERENCES imodels(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  svg_data TEXT NOT NULL,
  author_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_markups_imodel ON markups(i_model_id);
```

---

## 五、使用流程

1. **启动标记**: 点击"标记"按钮 → 输入会话名称 → 进入标记模式
2. **选择工具**: 从工具栏选择线、矩形、箭头等
3. **绘制**: 在视图上绘制标记
4. **文字标注**: 点击文字工具 → 放置位置 → 输入内容
5. **保存**: 点击保存按钮 → 存储到后端
6. **导出**: 导出为 SVG 文件
7. **退出**: 点击退出按钮 → 返回正常查看模式
