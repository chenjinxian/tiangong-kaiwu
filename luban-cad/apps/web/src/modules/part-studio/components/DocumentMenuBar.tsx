/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DocumentMenuBar（M3 Task 7）：汉堡文档菜单（对齐 os-24，顶栏汉堡钮）——
 * - 项序（实测 os-24）：重命名文档 / 移至… / 文档详细信息… / 还原已删除的工
 *   作区… / ─ / 复制工作区… / 更新工作区… / 工作区单位… / 工作区属性… /
 *   切换到仅查看模式 / ─ / 打印… / ─ / 关闭文档；
 * - full 项路由：重命名文档→复用 documents 模块 RenameDocumentDialog
 *   （跨模块经 @modules/documents barrel，重命名后失效顶栏面包屑查询）；
 *   文档详细信息…→ /documents/:iTwinId（document-details 模块）；
 *   工作区单位…→ 单位对话框（毫米 mm 唯一可选项，其余单位 disabled 占位——
 *   完整 UI 面口径）；切换到仅查看模式→ store.viewOnly 切换（菜单
 *   checkmark/标签反转）；关闭文档→ /documents；
 * - gated 项（移至…/还原…/复制…/更新…/工作区属性…/打印…）照常可点，
 *   点击开能力引导对话框（CapabilityDialog，spec §5 完整 UI 面）。
 *
 * B-model P2.4（P2.1 F5 承接）：`mode` 由页面按 iTwin 标记派生——B 文档的
 * 「重命名文档」= iModel 重命名（ImodelsClient.update，doc id=iModelId、
 * projectId=iTwinId），受 `canManage`（iModel imodels_manage，fail-closed）门禁；
 * A 旧文档保持 ItwinsClient.update 旧通道。B 文档分享在顶栏走 iModel ACL，
 * 不会回落 iTwin 通道。
 *
 * 挂账：工作区单位暂只支持毫米（内核单位制跟随里程碑）；「切换到仅查看
 * 模式」的 ribbon 只读态消费面后续波次（本版 store 会话态 + 菜单态落地）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dialog,
  DropdownMenu,
  IconButton,
  LabeledSelect,
  MenuDivider,
  MenuItem,
  Text,
} from '@itwin/itwinui-react';
import { SvgMenu } from '@itwin/itwinui-icons-react';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';
import { RenameDocumentDialog, type DocumentMode } from '@modules/documents';
import { isGated } from '../internal/capabilities.js';
import { CapabilityDialog } from '../ribbon/Ribbon.js';
import { usePartStudioStore } from '../stores/use-part-studio-store.js';
import './DocumentMenuBar.css';

export interface DocumentMenuBarProps {
  /** 当前 iTwin（A 文档 id；B 文档的 projectId/详细信息路由寻址）。 */
  iTwinId: string;
  /** 当前 iModel id（仅 B；重命名文档=iModel 名称）。 */
  iModelId?: string;
  /** B/A 文档上下文（P2.1 F5 承接 / P2.4 DoD）：缺省 A 保持旧调用语义。 */
  mode?: DocumentMode;
  /** 当前文档名（重命名对话框预填值；B=iModel 名，A=iTwin 名）。 */
  documentName: string;
  /** B 文档重命名授权（iModel `imodels_manage`，fail-closed；A 忽略）。 */
  canManage?: boolean;
}

/** 工作区单位可选项（mm=唯一可用；其余单位制占位 disabled——完整 UI 面）。 */
const UNIT_OPTIONS: readonly { value: 'mm' | 'in' | 'cm' | 'm'; disabled: boolean }[] = [
  { value: 'mm', disabled: false },
  { value: 'in', disabled: true },
  { value: 'cm', disabled: true },
  { value: 'm', disabled: true },
];

export function DocumentMenuBar({
  iTwinId,
  iModelId,
  mode = 'A',
  documentName,
  canManage = true,
}: DocumentMenuBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const viewOnly = usePartStudioStore((s) => s.viewOnly.isActive);
  const toggleViewOnly = usePartStudioStore((s) => s.toggleViewOnly);

  const [gatedCapability, setGatedCapability] = React.useState<string | null>(null);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [unitsOpen, setUnitsOpen] = React.useState(false);

  /** 单位选项走 i18n（zh/en 双语）；disabled 口径由数据表钉死。 */
  const unitOptions = React.useMemo(
    () =>
      UNIT_OPTIONS.map((option) => ({
        ...option,
        label: t(`partStudio.documentMenu.unitsDialog.options.${option.value}`),
      })),
    [t],
  );

  /**
   * 重命名对话框 doc 契约：useMemo 钉引用（依赖 iTwinId/面包屑名）——
   * RenameDocumentDialog 的 useEffect([doc]) 在 doc 引用变化时重置输入框；
   * 父级重渲染（面包屑查询回填等）若每次构造新对象会误重置用户输入。
   */
  const renameDoc = React.useMemo(
    () => ({
      // B 文档 = iModel（id=iModelId、projectId=iTwinId）；A 旧文档 = iTwin。
      id: mode === 'B' ? (iModelId ?? '') : iTwinId,
      name: documentName,
      owner: '',
      role: '',
      createdAt: '',
      modifiedAt: null,
      mode,
      projectId: iTwinId,
    }),
    [mode, iTwinId, iModelId, documentName],
  );

  /** B 文档重命名 = ImodelsClient.update（iModel name）；A = 对话框缺省 ItwinsClient。 */
  const handleRenameSubmit = React.useCallback(
    async (_doc: { id: string }, name: string): Promise<void> => {
      if (mode !== 'B' || !iModelId) return;
      await new ImodelsClient().update(iModelId, { name });
    },
    [mode, iModelId],
  );

  /** gated 项点击路由：开能力引导（不导航，不落库）。 */
  const handleGated = React.useCallback((capability: string) => {
    if (isGated(capability)) {
      setGatedCapability(capability);
    }
  }, []);

  const handleRenamed = React.useCallback(() => {
    // 顶栏面包屑名走 ['part-studio','breadcrumb',...] 查询族——重命名后失效。
    void queryClient.invalidateQueries({ queryKey: ['part-studio', 'breadcrumb'] });
  }, [queryClient]);

  const menuItems = [
    <MenuItem
      key="rename"
      disabled={mode === 'B' && !canManage}
      onClick={() => setRenameOpen(true)}
    >
      {t('partStudio.documentMenu.rename')}
    </MenuItem>,
    <MenuItem key="move" onClick={() => handleGated('moveDocument')}>
      {t('partStudio.documentMenu.move')}
    </MenuItem>,
    <MenuItem key="details" onClick={() => navigate(`/documents/${iTwinId}`)}>
      {t('partStudio.documentMenu.details')}
    </MenuItem>,
    <MenuItem key="restore" onClick={() => handleGated('restoreWorkspace')}>
      {t('partStudio.documentMenu.restoreWorkspace')}
    </MenuItem>,
    <MenuDivider key="sep-1" />,
    <MenuItem key="copy" onClick={() => handleGated('copyWorkspace')}>
      {t('partStudio.documentMenu.copyWorkspace')}
    </MenuItem>,
    <MenuItem key="update" onClick={() => handleGated('updateWorkspace')}>
      {t('partStudio.documentMenu.updateWorkspace')}
    </MenuItem>,
    <MenuItem key="units" onClick={() => setUnitsOpen(true)}>
      {t('partStudio.documentMenu.units')}
    </MenuItem>,
    <MenuItem key="properties" onClick={() => handleGated('workspaceProperties')}>
      {t('partStudio.documentMenu.workspaceProperties')}
    </MenuItem>,
    <MenuItem
      key="view-only"
      onClick={toggleViewOnly}
      isSelected={viewOnly}
    >
      {viewOnly
        ? t('partStudio.documentMenu.editMode')
        : t('partStudio.documentMenu.viewOnly')}
    </MenuItem>,
    <MenuDivider key="sep-2" />,
    <MenuItem key="print" onClick={() => handleGated('print')}>
      {t('partStudio.documentMenu.print')}
    </MenuItem>,
    <MenuDivider key="sep-3" />,
    <MenuItem key="close" onClick={() => navigate('/documents')}>
      {t('partStudio.documentMenu.closeDocument')}
    </MenuItem>,
  ];

  return (
    <>
      <DropdownMenu menuItems={menuItems} className="document-menu-bar">
        <IconButton
          label={t('partStudio.documentMenu.open')}
          styleType="borderless"
          className="document-menu-bar__trigger"
        >
          <SvgMenu />
        </IconButton>
      </DropdownMenu>

      {/* 重命名文档：复用 documents 模块对话框（跨模块 barrel 消费；doc 经
          useMemo 钉引用，父级重渲染不误重置输入框）。B 文档经 onRenameSubmit
          走 iModel 通道；A 文档缺省 = ItwinsClient.update（旧行为）。 */}
      <RenameDocumentDialog
        doc={renameDoc}
        isOpen={renameOpen}
        onClose={() => setRenameOpen(false)}
        onRenamed={handleRenamed}
        onRenameSubmit={mode === 'B' ? handleRenameSubmit : undefined}
      />

      {/* 工作区单位：毫米唯一可用；其余单位制占位（完整 UI 面）。setFocus
          （review-8 I-1 P2 补齐）：打开即焦点入对话框——Escape 关闭挂对话框
          元素 onKeyDown，焦点不在其内则击键永不可达。 */}
      <Dialog isOpen={unitsOpen} onClose={() => setUnitsOpen(false)} portal isDismissible setFocus>
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('partStudio.documentMenu.unitsDialog.title')}
          className="document-menu-bar__units-dialog"
        >
          <Dialog.TitleBar titleText={t('partStudio.documentMenu.unitsDialog.title')} />
          <Dialog.Content>
            {/* LabeledSelect：InputGrid 自动 aria-labelledby（裸 Select 的
                aria-label 落不进原生 select——共享对话框同口径挂账）。 */}
            <LabeledSelect
              native
              label={t('partStudio.documentMenu.unitsDialog.unitsLabel')}
              value="mm"
              options={unitOptions}
              onChange={() => {
                // 仅 mm 可用（options 其余项 disabled）；选中变化暂不可达，
                // 单位制接线后由 store/后端承载（内核单位制跟随里程碑）。
              }}
            />
            <Text variant="small" className="document-menu-bar__units-hint">
              {t('partStudio.documentMenu.unitsDialog.hint')}
            </Text>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button styleType="default" onClick={() => setUnitsOpen(false)}>
              {t('partStudio.documentMenu.unitsDialog.close')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>

      {/* gated 项能力引导（os-24 规划项，文案取 CAPABILITY_GUIDANCE）。 */}
      <CapabilityDialog capability={gatedCapability} onClose={() => setGatedCapability(null)} />
    </>
  );
}
