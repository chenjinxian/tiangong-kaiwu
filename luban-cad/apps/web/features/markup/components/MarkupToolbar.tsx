/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Markup Toolbar Component
 * Provides access to markup tools
 */

import React, { useState } from 'react';
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
  SvgMore,
  SvgSave,
  SvgClose,
  SvgCrop,
  SvgList,
} from '@itwin/itwinui-icons-react';
import { MarkupToolType } from '../hooks/useMarkupManager';

interface MarkupToolbarProps {
  activeTool: MarkupToolType | null;
  isActive: boolean;
  onStart: (name: string) => void;
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
  { type: 'distance', icon: <SvgCrop />, label: '距离标注' },
  { type: 'symbol', icon: <SvgList />, label: '符号' },
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
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  if (!isActive) {
    return (
      <div className="markup-toolbar-inactive">
        <Tooltip content="启动标记模式">
          <IconButton
            onClick={() => setShowNameDialog(true)}
            styleType="high-visibility"
          >
            <SvgDraw />
          </IconButton>
        </Tooltip>

        <Dialog
          isOpen={showNameDialog}
          onClose={() => setShowNameDialog(false)}
          title="新建标记会话"
        >
          <div style={{ padding: '16px' }}>
            <Input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="输入会话名称"
              size="large"
            />
          </div>
          <div className="dialog-button-group" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setShowNameDialog(false)}>取消</button>
            <button
              onClick={() => {
                onStart(sessionName || `标记 ${new Date().toLocaleTimeString()}`);
                setShowNameDialog(false);
                setSessionName('');
              }}
              style={{ fontWeight: 600 }}
            >
              开始标记
            </button>
          </div>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="markup-toolbar-active">
      <ButtonGroup className="markup-tools">
        {tools.slice(0, 8).map((tool) => (
          <Tooltip key={tool.type} content={tool.label}>
            <IconButton
              styleType={activeTool === tool.type ? 'cta' : 'default'}
              onClick={() => onToolSelect(tool.type)}
            >
              {tool.icon}
            </IconButton>
          </Tooltip>
        ))}

        <Tooltip content="更多工具">
          <IconButton
            styleType={activeTool && ['text', 'distance', 'symbol'].includes(activeTool) ? 'cta' : 'default'}
            onClick={() => setShowMoreMenu(true)}
          >
            <SvgMore />
          </IconButton>
        </Tooltip>
      </ButtonGroup>

      <Dialog
        isOpen={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        title="更多标记工具"
      >
        <div className="markup-more-tools">
          {tools.slice(8).map((tool) => (
            <div
              key={tool.type}
              className={`markup-tool-item ${activeTool === tool.type ? 'active' : ''}`}
              onClick={() => {
                onToolSelect(tool.type);
                setShowMoreMenu(false);
              }}
            >
              <span className="markup-tool-icon">{tool.icon}</span>
              <span className="markup-tool-label">{tool.label}</span>
            </div>
          ))}
        </div>
      </Dialog>

      <div className="markup-actions">
        <Tooltip content="保存">
          <IconButton onClick={onSave}>
            <SvgSave />
          </IconButton>
        </Tooltip>
        <Tooltip content="导出 SVG">
          <IconButton onClick={onExport}>
            <SvgArrowRight />
          </IconButton>
        </Tooltip>
        <Tooltip content="退出标记模式">
          <IconButton onClick={onStop} styleType="high-visibility">
            <SvgClose />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
};
