/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioPage（M3 Task 3；T7 页签管理器接线）：/documents/:iTwinId/:iModelId Part Studio 编辑器
 * 布局壳（对齐 Onshape os-11 五区）——
 * - 顶栏（PartStudioTopBar）：品牌 + 面包屑（文档/iTwin/iModel）+ 分支徽标 +
 *   分享 + 用户菜单 + 帮助；
 * - 左栏（PartStudioSidebar）：窄图标条 + 双段树（特征/零件）；
 * - 中央画布（PartStudioCanvas）：viewport 挂载点；
 * - 右停靠（PartStudioDock）：工具设置/版本历史/显示设置三页签；
 * - 底部（PartStudioTabs）：页签条（适应视图/「+」开页签管理器[T7，os-33]/
 *   Part Studio 1）+ 状态栏（连接态/编辑模式/单位/视图类型）。
 *
 * 查看器接线：useViewport（viewer-next）在页面层单实例——backendUrl 传同源
 * （MS CORS 钉死 :5300，web-next :5310 走 vite 代理，见 vite.config.ts 注记；
 * 姿态同 DevViewerRoute），viewportRef 下沉画布、相位上供状态栏。ribbon/
 * 命令搜索（T4）挂顶栏下；树数据/特征对话框等 T5+ 接管。
 */

import React from 'react';
import { useParams } from 'react-router-dom';
import { useViewport } from '@luban-cad/viewer-next';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { env } from '@config/env.js';
import { PartStudioTopBar } from './components/PartStudioTopBar.js';
import { PartStudioSidebar } from './components/PartStudioSidebar.js';
import { PartStudioCanvas } from './components/PartStudioCanvas.js';
import { PartStudioDock } from './components/PartStudioDock.js';
import { PartStudioTabs } from './components/PartStudioTabs.js';
import { Ribbon } from './ribbon/Ribbon.js';
import { CommandPalette } from './ribbon/CommandPalette.js';
import './PartStudioPage.css';

export function PartStudioPage(): React.JSX.Element {
  const { iTwinId, iModelId } = useParams<{ iTwinId: string; iModelId: string }>();
  // 会话由 RequireAuth 门保证在场；token 静态传入（M3 雷②闭环：渲染期取一次，
  // 与 DevViewerRoute 同姿态；动态续接的 token 刷新闭环在 viewer-next 演进）。
  const { viewportRef, phase } = useViewport({
    backendUrl: window.location.origin,
    hubUrl: env.hubUrl,
    accessToken: AuthSession.getStoredAuth()?.accessToken,
  });

  return (
    <div className="part-studio-page" data-testid="part-studio-page">
      <PartStudioTopBar iTwinId={iTwinId ?? ''} iModelId={iModelId ?? ''} />
      {/* 工具 ribbon（os-11 第二行）：27 工具 + 8 下拉 + 命令搜索触发钮。 */}
      <Ribbon />
      <div className="part-studio-body">
        <PartStudioSidebar />
        <div className="part-studio-main">
          <PartStudioCanvas viewportRef={viewportRef} />
          <PartStudioDock />
        </div>
      </div>
      <PartStudioTabs iTwinId={iTwinId ?? ''} iModelId={iModelId ?? ''} connection={phase} />
      {/* 命令搜索面板：页面级常驻挂载（alt+/ 热键经 store 驱动开合）。 */}
      <CommandPalette />
    </div>
  );
}
