/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * PartStudioTabs（M3 Task 3；T7 页签管理器；M4-T8 和弦热键；B-model P2.4
 * 注册表真页签 + URL 生产者）：编辑器底部区（os-11 页签条 + 状态栏）——
 * - **B 文档页签** = `usePartStudios` 的注册表列表（studios props 透传，本组件
 *   零 registry 调用）；active = URL `?model=`；点击只经 `workspaceRefPath`
 *   换 URL（路由不变 → 不重建 BriefcaseConnection，P2.4 硬约束）；
 * - **半图 degraded 页签**（physModelId=''）标注「已损坏」，可切换查看恢复面；
 * - 「+」= 创建默认名称 Part Studio（onCreate 由页面接 usePartStudios.create，
 *   同一共享会话/租约），成功后导航到新 scope；
 * - 「Part Studio 操作」菜单 = 重命名/删除（写通道同 registry；删除走 HITL
 *   确认对话框；最后一个完整 scope 的服务端拒绝原文就地呈现，不吞错）；
 * - **A 旧文档** = legacy 单页签（`tabs.partStudio`），「+」/重命名/删除全部
 *   禁用——无 `?model=`、零 registry 调用（只读由页面 canEdit 总门与横幅承载）；
 * - alt+~+t 和弦热键开页签管理器（os-33；管理器列 Part Studio，P2.4 重写）；
 * - 状态栏：连接态（useViewport 相位 + briefcase 相位合并映射）/ 编辑模式 /
 *   单位 / 视图类型（后三项壳期静态值，随工具/视口接线演进）。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dialog,
  DropdownMenu,
  IconButton,
  LabeledInput,
  MenuItem,
  Text,
} from '@itwin/itwinui-react';
import { SvgAdd, SvgFitToView, SvgMore } from '@itwin/itwinui-icons-react';
import type { PartStudioInfo } from '@luban-cad/shared';
import type { DocumentMode } from '@modules/documents';
import type { ViewportPhase } from '@luban-cad/viewer';
import { workspaceRefPath } from '@common/workspace/workspace-ref.js';
import { TabManagerDialog } from '../tabs/TabManagerDialog.js';

export interface PartStudioTabsProps {
  /** B=注册表页签；A=legacy 单页签（缺省 A，兼容旧调用/单测）。 */
  mode?: DocumentMode;
  /** 当前 iTwin（workspaceRefPath 生产者/页签管理器寻址）。 */
  iTwinId: string;
  /** 当前 iModel（workspaceRefPath 生产者/页签管理器寻址）。 */
  iModelId: string;
  /** B 文档的注册表页签（A 忽略）。 */
  studios?: readonly PartStudioInfo[];
  /** 活动 Part Studio id（URL `?model=`）。 */
  activeModelId?: string;
  studiosLoading?: boolean;
  studiosError?: string | null;
  /** 创建/重命名/删除授权（B ∧ 权限可写 ∧ scope 已解析）。 */
  canEdit?: boolean;
  /** 创建默认名称 Part Studio（页面接 usePartStudios.create；返回新条目用于导航）。 */
  onCreate?: () => Promise<PartStudioInfo | undefined> | PartStudioInfo | undefined | void;
  onRename?: (partStudioId: string, name: string) => Promise<void>;
  onDelete?: (partStudioId: string) => Promise<void>;
  onRetryStudios?: () => void;
  /** 运行时连接相位（useViewport 出口 → 状态栏连接态）。 */
  connection: ViewportPhase;
  /** briefcase 打开中（M5-T2：isLoading 消费——「正在打开文档…」，优先于 host 相位呈现）。 */
  briefcaseLoading?: boolean;
  /** briefcase 打开失败消息（M5-T2：error 消费；原文在画布错误面）。 */
  briefcaseError?: string | null;
  /** viewport 创建失败消息（T2 评审：useViewport error 出口——phase 可仍 ready）。 */
  viewportError?: string | null;
}

/** 相位 → 连接态文案键（M5-T2 合并映射；P2.4 语义不变）。 */
function connectionKey(
  connection: ViewportPhase,
  briefcaseLoading: boolean,
  briefcaseError: string | null,
  viewportError: string | null,
): string {
  if (briefcaseError) return 'partStudio.status.connectionFailed';
  if (briefcaseLoading) return 'partStudio.status.openingDocument';
  if (connection === 'error' || viewportError) return 'partStudio.status.connectionFailed';
  if (connection === 'ready') return 'partStudio.status.connected';
  return 'partStudio.status.connecting';
}

export function PartStudioTabs({
  mode = 'A',
  iTwinId,
  iModelId,
  studios = [],
  activeModelId,
  studiosLoading = false,
  studiosError = null,
  canEdit = false,
  onCreate,
  onRename,
  onDelete,
  onRetryStudios,
  connection,
  briefcaseLoading = false,
  briefcaseError = null,
  viewportError = null,
}: PartStudioTabsProps): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tabManagerOpen, setTabManagerOpen] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameName, setRenameName] = React.useState('');
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const isB = mode === 'B';
  const activeStudio = isB && activeModelId
    ? studios.find((studio) => studio.id === activeModelId)
    : undefined;

  // alt+~+t 和弦热键（os-33 底栏标注键位；M4-T8 收 M3 终审 T7-①）：Alt+~
  // 挂弦，下一击 t 开页签管理器（和弦语义非三键同时；任一其他击键解除挂弦）。
  // 可编辑焦点内不派发（viewer 键位守卫同口径）。
  React.useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      const el = (target instanceof Element ? target : document.activeElement) as HTMLElement | null;
      if (!el) return false;
      return (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
        || el.isContentEditable === true
        || el.getAttribute('contenteditable') === 'true'
      );
    };
    let chordArmed = false;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey && (event.key === '~' || event.key === '`')) {
        chordArmed = true;
        return;
      }
      if (chordArmed && event.key.toLowerCase() === 't') {
        chordArmed = false;
        if (!isEditableTarget(event.target)) {
          event.preventDefault();
          setTabManagerOpen(true);
        }
        return;
      }
      chordArmed = false;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** 页签点击：只换 URL（workspaceRefPath），路由不变 → 连接不重建。 */
  const openStudio = React.useCallback(
    (studioId: string) => {
      navigate(workspaceRefPath({ iTwinId, iModelId, modelId: studioId }));
    },
    [navigate, iTwinId, iModelId],
  );

  const handleCreate = React.useCallback(async () => {
    if (!isB || !canEdit || !onCreate) return;
    setIsCreating(true);
    setActionError(null);
    try {
      const created = await onCreate();
      if (created) navigate(workspaceRefPath({ iTwinId, iModelId, modelId: created.id }));
    } catch (err) {
      setActionError(
        t('partStudio.tabs.createFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    } finally {
      setIsCreating(false);
    }
  }, [isB, canEdit, onCreate, navigate, iTwinId, iModelId, t]);

  const openRename = React.useCallback(() => {
    if (!activeStudio) return;
    setRenameName(activeStudio.name);
    setRenameError(null);
    setRenameOpen(true);
  }, [activeStudio]);

  const submitRename = React.useCallback(async () => {
    if (!activeStudio || !onRename) return;
    const name = renameName.trim();
    if (!name) return;
    setIsRenaming(true);
    setRenameError(null);
    try {
      await onRename(activeStudio.id, name);
      setRenameOpen(false);
    } catch (err) {
      setRenameError(
        t('partStudio.tabs.renameFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    } finally {
      setIsRenaming(false);
    }
  }, [activeStudio, onRename, renameName, t]);

  const submitDelete = React.useCallback(async () => {
    if (!activeStudio || !onDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(activeStudio.id);
      setDeleteOpen(false);
      // 删除的是活动 scope：切到剩余第一个完整 scope；无完整则回基路径让解析器
      // 呈现恢复面（最后一个完整 scope 的服务端拒绝不会走到这里）。
      const remaining = studios.filter((studio) => studio.id !== activeStudio.id);
      const next = remaining.find((studio) => studio.physModelId !== '') ?? remaining[0];
      navigate(
        next
          ? workspaceRefPath({ iTwinId, iModelId, modelId: next.id })
          : workspaceRefPath({ iTwinId, iModelId }),
        { replace: true },
      );
    } catch (err) {
      // 最后一个完整 scope / 租约 holder 等服务端拒绝原文就地呈现（不吞错）。
      setDeleteError(
        t('partStudio.tabs.deleteFailed', { message: err instanceof Error ? err.message : String(err) }),
      );
    } finally {
      setIsDeleting(false);
    }
  }, [activeStudio, onDelete, studios, navigate, iTwinId, iModelId, t]);

  const tabMenuItems = [
    <MenuItem key="rename" disabled={activeStudio?.physModelId === ''} onClick={openRename}>
      {t('partStudio.tabs.rename')}
    </MenuItem>,
    <MenuItem
      key="delete"
      onClick={() => {
        setDeleteError(null);
        setDeleteOpen(true);
      }}
    >
      {t('partStudio.tabs.delete')}
    </MenuItem>,
  ];

  return (
    <>
      {/* 页签条（os-11 底部）：左操作组 + 页签 */}
      <div className="part-studio-tab-strip" data-testid="part-studio-tab-strip">
        <div className="part-studio-tab-strip__actions">
          {/* 适应视图：壳期可点占位（T6 接 Viewport 视图命令）。 */}
          <IconButton label={t('partStudio.tabs.fitView')} styleType="borderless">
            <SvgFitToView />
          </IconButton>
          {/* 「+」（P2.4）：B 文档=创建默认名称 Part Studio；A/只读禁用。 */}
          <IconButton
            label={t('partStudio.tabs.newPartStudio')}
            styleType="borderless"
            disabled={!isB || !canEdit || isCreating}
            onClick={() => void handleCreate()}
            data-testid="part-studio-new-tab-button"
          >
            <SvgAdd />
          </IconButton>
          {/* 重命名/删除菜单（B 活动 scope；删除 HITL）。 */}
          {isB && activeStudio && (
            <DropdownMenu menuItems={tabMenuItems} placement="top">
              <IconButton
                label={t('partStudio.tabs.menu')}
                styleType="borderless"
                disabled={!canEdit}
                data-testid="part-studio-tab-actions"
              >
                <SvgMore />
              </IconButton>
            </DropdownMenu>
          )}
        </div>
        <div role="tablist" aria-label={t('partStudio.tabs.partStudio')} className="part-studio-tab-strip__tabs">
          {isB
            ? studios.map((studio) => {
                const damaged = studio.physModelId === '';
                const active = studio.id === activeModelId;
                return (
                  <button
                    key={studio.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-studio-id={studio.id}
                    data-damaged={damaged ? 'true' : undefined}
                    className={`part-studio-tab${active ? ' part-studio-tab--active' : ''}`}
                    onClick={() => openStudio(studio.id)}
                  >
                    {studio.name}
                    {damaged && (
                      <span className="part-studio-tab__damaged" data-damaged="true">
                        {t('partStudio.tabs.damaged')}
                      </span>
                    )}
                  </button>
                );
              })
            : (
                <button
                  type="button"
                  role="tab"
                  aria-selected
                  className="part-studio-tab part-studio-tab--active"
                >
                  {t('partStudio.tabs.partStudio')}
                </button>
              )}
        </div>
      </div>

      {/* 页签操作错误（创建失败等）；删除/重命名错误在各自对话框内就地呈现。 */}
      {actionError && (
        <div role="alert" className="part-studio-tab-strip__error" data-testid="part-studio-tabs-error">
          <Text color="negative" variant="small">{actionError}</Text>
        </div>
      )}

      {/* 状态栏：连接态 / 编辑模式 / 单位 / 视图类型 */}
      <div className="part-studio-status-bar" data-testid="part-studio-status-bar">
        <span className="part-studio-status-bar__item">
          <span className="part-studio-status-bar__label">{t('partStudio.status.connection')}</span>
          <span className="part-studio-status-bar__value" data-testid="part-studio-status-connection">
            {t(connectionKey(connection, briefcaseLoading, briefcaseError, viewportError))}
          </span>
        </span>
        <span className="part-studio-status-bar__item">
          <span className="part-studio-status-bar__label">{t('partStudio.status.editMode')}</span>
          <span className="part-studio-status-bar__value">{t('partStudio.status.editModePart')}</span>
        </span>
        <span className="part-studio-status-bar__item">
          <span className="part-studio-status-bar__label">{t('partStudio.status.units')}</span>
          <span className="part-studio-status-bar__value">{t('partStudio.status.unitMm')}</span>
        </span>
        <span className="part-studio-status-bar__item">
          <span className="part-studio-status-bar__label">{t('partStudio.status.viewType')}</span>
          <span className="part-studio-status-bar__value">{t('partStudio.status.viewIso')}</span>
        </span>
      </div>

      {/* 页签管理器（os-33）：alt+~+t 开合；列 Part Studio（A=单页签）。 */}
      <TabManagerDialog
        mode={mode}
        iTwinId={iTwinId}
        iModelId={iModelId}
        studios={studios}
        activeModelId={activeModelId}
        isLoading={studiosLoading}
        error={studiosError}
        onRetry={onRetryStudios}
        isOpen={tabManagerOpen}
        onClose={() => setTabManagerOpen(false)}
      />

      {/* 重命名（注册表 rename；错误就地） */}
      <Dialog isOpen={renameOpen} onClose={() => setRenameOpen(false)} portal isDismissible>
        <Dialog.Backdrop />
        <Dialog.Main styleType="default" title={t('partStudio.tabs.renameTitle')}>
          <Dialog.TitleBar titleText={t('partStudio.tabs.renameTitle')} />
          <Dialog.Content>
            {renameError && <Text color="negative" variant="small">{renameError}</Text>}
            <LabeledInput
              label={t('partStudio.tabs.renameNameLabel')}
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              disabled={isRenaming}
              autoFocus
            />
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button styleType="default" onClick={() => setRenameOpen(false)} disabled={isRenaming}>
              {t('partStudio.tabs.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              onClick={() => void submitRename()}
              disabled={isRenaming || !renameName.trim()}
              loading={isRenaming}
            >
              {t('partStudio.tabs.renameSubmit')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>

      {/* 删除 HITL（破坏性操作：确认后才调 registry） */}
      <Dialog isOpen={deleteOpen} onClose={() => setDeleteOpen(false)} portal isDismissible>
        <Dialog.Backdrop />
        <Dialog.Main styleType="default" title={t('partStudio.tabs.deleteTitle')}>
          <Dialog.TitleBar titleText={t('partStudio.tabs.deleteTitle')} />
          <Dialog.Content>
            <Text variant="body">
              {t('partStudio.tabs.deleteConfirm', { name: activeStudio?.name ?? '' })}
            </Text>
            {deleteError && <Text color="negative" variant="small">{deleteError}</Text>}
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button styleType="default" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              {t('partStudio.tabs.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              onClick={() => void submitDelete()}
              disabled={isDeleting}
              loading={isDeleting}
            >
              {t('partStudio.tabs.deleteSubmit')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>
    </>
  );
}
