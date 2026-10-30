/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ShareDocumentDialog（Task 5 / P2.3）：分享对话框——按目标类型分流：
 * - A 旧文档 / B 项目容器（无 `imodelId`）→ iTwin access-control 三页签
 *   （成员/邀请/链接；移植自旧应用 ShareITwinDialog，行为原样保留）；
 * - B 文档（`mode='B'` 且给定 `imodelId`）→ iModel 显式权限通道：
 *   读 `isSecured` + `GET /imodels/:id/permissions/users`，授权 Read/Manage
 *   （`POST .../permissions/grant`）、撤销（`DELETE .../permissions/users/:userId`）；
 *   邮箱邀请先经 access-control 加入项目成员，再 grant；**不声称链接分享**
 *   （hub 无 iModel 链接分享通道，B 分支不渲染链接页签）。
 *
 * 身份展示：iModel 权限行只有 userId；与 iTwin 成员面按 `member.id`（成员行）
 * 或 `member.email`（hub REST 加入成员时的 userId 回退）关联，关联不到时
 * 直接展示 userId（不猜测身份）。
 *
 * 与旧实现的差异（A 分支）：入参 iTwin → doc（DocumentSummary）；toast →
 * 页内内联状态条；queryKeys 内联。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  IconButton,
  Input,
  LabeledInput,
  Label,
  ProgressRadial,
  Select,
  Tabs,
  Text,
} from '@itwin/itwinui-react';
import { SvgAdd, SvgCheckmark, SvgCopy, SvgDelete } from '@itwin/itwinui-icons-react';
import type { IModel } from '@itwin/imodels-client-management';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';
import type {
  GrantImodelPermissionInput,
  ImodelPermissionLevel,
  ImodelUserPermission,
} from '@clients/imodels/types.js';
import type { DocumentSummary } from '../types.js';
import {
  addUserMember,
  listRoles,
  listUserMembers,
  removeUserMember,
  updateUserMember,
  type AddUserMemberRequest,
  type ITwinMember,
} from '../internal/share.api.js';

export interface ShareDocumentDialogProps {
  doc: DocumentSummary | null;
  isOpen: boolean;
  onClose: () => void;
  /**
   * B 文档（iModel）目标 id。给定且 `doc.mode==='B'` → iModel 权限通道；
   * 缺席（A 旧文档、B 项目容器）→ 既有 iTwin 通道。
   */
  imodelId?: string | null;
}

type ShareTab = 'members' | 'invite' | 'link';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ShareDocumentDialog(props: ShareDocumentDialogProps): React.JSX.Element | null {
  const { doc, isOpen, onClose, imodelId } = props;
  if (!doc) return null;
  const isBModelShare = doc.mode === 'B' && !!imodelId;
  if (isBModelShare) {
    return (
      <BShareDialog
        doc={doc}
        imodelId={imodelId}
        isOpen={isOpen}
        onClose={onClose}
      />
    );
  }
  return <ITwinShareDialog doc={doc} isOpen={isOpen} onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// A 旧文档 / B 项目容器：既有 iTwin 三页签通道（行为不变）
// ---------------------------------------------------------------------------

function ITwinShareDialog({
  doc,
  isOpen,
  onClose,
}: {
  doc: DocumentSummary;
  isOpen: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const iTwinId = doc.id;

  const [activeTab, setActiveTab] = React.useState<ShareTab>('members');
  const [email, setEmail] = React.useState('');
  const [selectedRoleId, setSelectedRoleId] = React.useState('');
  const [inviteError, setInviteError] = React.useState('');
  // 成员页内联状态条（toast 的等价替代，见模块头注）。
  const [statusMessage, setStatusMessage] = React.useState<{ kind: 'positive' | 'negative'; text: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<ITwinMember | null>(null);

  const membersQuery = useQuery({
    queryKey: ['documents', 'share', 'members', iTwinId],
    queryFn: async () => listUserMembers(iTwinId),
    enabled: isOpen && !!iTwinId,
    staleTime: 30 * 1000,
  });

  const rolesQuery = useQuery({
    queryKey: ['documents', 'share', 'roles', iTwinId],
    queryFn: async () => listRoles(iTwinId),
    enabled: isOpen && !!iTwinId,
    staleTime: 5 * 60 * 1000,
  });

  const invalidateMembers = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['documents', 'share', 'members', iTwinId] });
  }, [iTwinId, queryClient]);

  const addMemberMutation = useMutation({
    mutationFn: (request: AddUserMemberRequest) => addUserMember(iTwinId, request),
    onSuccess: invalidateMembers,
  });

  const updateMemberMutation = useMutation({
    // PATCH 返回 roleIds 异形，仅确认成功；列表刷新后由 ITwinMember.roles 渲染
    mutationFn: (input: { memberId: string; roleIds: string[] }) =>
      updateUserMember(iTwinId, input.memberId, { roleIds: input.roleIds }),
    onSuccess: () => {
      invalidateMembers();
      setStatusMessage({ kind: 'positive', text: t('documents.shareDialog.members.roleUpdated') });
    },
    onError: () => setStatusMessage({ kind: 'negative', text: t('documents.shareDialog.members.roleUpdateFailed') }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => removeUserMember(iTwinId, memberId),
    onSuccess: () => {
      invalidateMembers();
      setRemoveTarget(null);
      setStatusMessage({ kind: 'positive', text: t('documents.shareDialog.members.removeSuccess') });
    },
    onError: () => setStatusMessage({ kind: 'negative', text: t('documents.shareDialog.members.removeFailed') }),
  });

  const roleOptions = React.useMemo(
    () => (rolesQuery.data ?? []).map((role) => ({ value: role.id, label: role.displayName })),
    [rolesQuery.data],
  );

  // 邀请角色：未手动选择时默认第一个可用角色（无角色则提交空 roleIds）
  const effectiveRoleId = selectedRoleId || roleOptions[0]?.value || '';

  const members = membersQuery.data ?? [];

  const shareLink = iTwinId ? `${window.location.origin}/documents/${iTwinId}` : '';

  const handleClose = React.useCallback(() => {
    setActiveTab('members');
    setEmail('');
    setSelectedRoleId('');
    setInviteError('');
    setStatusMessage(null);
    setCopied(false);
    setRemoveTarget(null);
    onClose();
  }, [onClose]);

  const handleInvite = React.useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setInviteError(t('documents.shareDialog.invite.emailRequired'));
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setInviteError(t('documents.shareDialog.invite.invalidEmail'));
      return;
    }

    try {
      await addMemberMutation.mutateAsync({
        email: trimmed,
        roleIds: effectiveRoleId ? [effectiveRoleId] : [],
      });
      setInviteError('');
      setEmail('');
      setStatusMessage({ kind: 'positive', text: t('documents.shareDialog.invite.success', { email: trimmed }) });
      // 邀请即成员（本 hub POST members/users 直接加人）——切回成员页看结果
      setActiveTab('members');
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : t('documents.shareDialog.invite.failed'));
    }
  }, [email, effectiveRoleId, addMemberMutation, t]);

  const handleRoleChange = React.useCallback(
    (member: ITwinMember, roleId: string) => {
      updateMemberMutation.mutate({
        memberId: member.id,
        roleIds: roleId ? [roleId] : [],
      });
    },
    [updateMemberMutation],
  );

  const handleConfirmRemove = React.useCallback(() => {
    if (removeTarget) {
      removeMemberMutation.mutate(removeTarget.id);
    }
  }, [removeTarget, removeMemberMutation]);

  const handleCopyLink = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用（权限/非安全上下文）——保持静默，输入框可手动复制
    }
  }, [shareLink]);

  const membersTabLabel = t('documents.shareDialog.tabs.members', { count: members.length });

  return (
    <>
      {/* setFocus（review-8 I-1 残留面收口，同 TabManagerDialog）：打开即焦点
          入对话框——Escape 关闭挂在对话框元素 onKeyDown 上，焦点不在其内则
          击键永不可达。 */}
      <Dialog isOpen={isOpen} onClose={handleClose} portal isDismissible setFocus>
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('documents.shareDialog.title')}
          className="share-dialog"
        >
          <Dialog.TitleBar titleText={t('documents.shareDialog.title')} />
          <Dialog.Content>
            <Tabs.Wrapper
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as ShareTab)}
            >
              <Tabs.TabList>
                <Tabs.Tab value="members" label={membersTabLabel} />
                <Tabs.Tab value="invite" label={t('documents.shareDialog.tabs.invite')} />
                <Tabs.Tab value="link" label={t('documents.shareDialog.tabs.link')} />
              </Tabs.TabList>

              {/* 成员 */}
              <Tabs.Panel value="members" className="share-tab-panel">
                {statusMessage && (
                  <Alert type={statusMessage.kind} className="share-alert">
                    {statusMessage.text}
                  </Alert>
                )}
                {membersQuery.isLoading ? (
                  <div className="share-members-loading">
                    <ProgressRadial size="small" indeterminate />
                    <Text variant="small">{t('documents.shareDialog.members.loading')}</Text>
                  </div>
                ) : membersQuery.isError ? (
                  <div className="share-members-empty">
                    <Alert type="negative" className="share-alert">
                      {t('documents.shareDialog.members.loadFailed')}
                    </Alert>
                    <Button
                      styleType="default"
                      onClick={() => void membersQuery.refetch()}
                    >
                      {t('documents.shareDialog.members.retry')}
                    </Button>
                  </div>
                ) : members.length === 0 ? (
                  <div className="share-members-empty">
                    <Text variant="body" className="share-empty-title">
                      {t('documents.shareDialog.members.empty')}
                    </Text>
                    <Text variant="small" className="share-empty-desc">
                      {t('documents.shareDialog.members.emptyHint')}
                    </Text>
                  </div>
                ) : (
                  <div className="share-members-list">
                    {members.map((member) => (
                      <div key={member.id} className="share-member">
                        <div className="share-member__info">
                          <Text className="share-member__email">{member.email}</Text>
                          <div className="share-member__meta">
                            {roleOptions.length > 0 ? (
                              <Select
                                native
                                size="small"
                                aria-label={t('documents.shareDialog.members.roleLabel')}
                                value={member.roles[0]?.id ?? ''}
                                options={[
                                  { value: '', label: t('documents.shareDialog.members.noRole') },
                                  ...roleOptions,
                                ]}
                                onChange={(value) => handleRoleChange(member, value)}
                              />
                            ) : (
                              <Text variant="small">
                                {member.roles.map((role) => role.displayName).filter(Boolean).join(', ')
                                  || t('documents.shareDialog.members.noRole')}
                              </Text>
                            )}
                          </div>
                        </div>
                        <IconButton
                          size="small"
                          styleType="borderless"
                          onClick={() => setRemoveTarget(member)}
                          label={t('documents.shareDialog.members.remove')}
                        >
                          <SvgDelete />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}
              </Tabs.Panel>

              {/* 邀请 */}
              <Tabs.Panel value="invite" className="share-tab-panel">
                {inviteError && (
                  <Alert type="negative" className="share-alert">{inviteError}</Alert>
                )}

                <LabeledInput
                  required
                  type="email"
                  label={t('documents.shareDialog.invite.emailLabel')}
                  placeholder={t('documents.shareDialog.invite.emailPlaceholder')}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setInviteError('');
                  }}
                  disabled={addMemberMutation.isPending}
                />

                <div className="share-invite-role">
                  <Label>{t('documents.shareDialog.invite.roleLabel')}</Label>
                  {roleOptions.length > 0 ? (
                    <Select
                      native
                      value={effectiveRoleId}
                      options={roleOptions}
                      onChange={(value) => setSelectedRoleId(value)}
                      disabled={addMemberMutation.isPending}
                    />
                  ) : (
                    <Text variant="small" className="share-hint-text">
                      {rolesQuery.isError
                        ? t('documents.shareDialog.invite.rolesLoadFailed')
                        : t('documents.shareDialog.invite.noRoles')}
                    </Text>
                  )}
                </div>

                <div className="share-hint">
                  <Text variant="small">{t('documents.shareDialog.invite.hint')}</Text>
                </div>

                <Button
                  styleType="high-visibility"
                  onClick={() => void handleInvite()}
                  loading={addMemberMutation.isPending}
                  disabled={addMemberMutation.isPending || !email.trim()}
                  startIcon={<SvgAdd />}
                >
                  {t('documents.shareDialog.invite.submit')}
                </Button>
              </Tabs.Panel>

              {/* 链接 */}
              <Tabs.Panel value="link" className="share-tab-panel">
                <div className="share-link-section">
                  <Label htmlFor="share-link-input">{t('documents.shareDialog.link.label')}</Label>
                  <div className="share-link-input-group">
                    <Input
                      id="share-link-input"
                      value={shareLink}
                      readOnly
                      className="share-link-input"
                    />
                    <IconButton
                      styleType="default"
                      onClick={() => void handleCopyLink()}
                      label={copied ? t('documents.shareDialog.link.copied') : t('documents.shareDialog.link.copy')}
                    >
                      {copied ? <SvgCheckmark /> : <SvgCopy />}
                    </IconButton>
                  </div>
                  <Text variant="small" className="share-link-hint">
                    {t('documents.shareDialog.link.hint')}
                  </Text>
                </div>
              </Tabs.Panel>
            </Tabs.Wrapper>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button styleType="default" onClick={handleClose}>
              {t('documents.shareDialog.close')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>

      {/* 移除成员确认（危险操作标准形态；setFocus 同上——确认层独立收 Escape）。 */}
      <Dialog
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        portal
        isDismissible
        setFocus
      >
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('documents.shareDialog.members.removeTitle')}
          className="share-remove-dialog"
        >
          <Dialog.TitleBar titleText={t('documents.shareDialog.members.removeTitle')} />
          <Dialog.Content>
            <Text>
              {t('documents.shareDialog.members.removeMessage', { email: removeTarget?.email ?? '' })}
            </Text>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setRemoveTarget(null)}
              disabled={removeMemberMutation.isPending}
            >
              {t('documents.shareDialog.members.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              className="share-danger-button"
              onClick={handleConfirmRemove}
              loading={removeMemberMutation.isPending}
              disabled={removeMemberMutation.isPending}
            >
              {t('documents.shareDialog.members.confirmRemove')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// B 文档：iModel 显式权限通道
// ---------------------------------------------------------------------------

type AccessLevel = 'read' | 'manage';

/** Read/Manage 映射到 hub 四维 level（Brief：grant Read/Manage）。 */
function levelPayload(userId: string, level: AccessLevel): GrantImodelPermissionInput {
  const levelValue: ImodelPermissionLevel = level === 'manage' ? 'manage' : 'read';
  return {
    userId,
    role: level === 'manage' ? 'admin' : 'user',
    briefcasesLevel: levelValue,
    changesetsLevel: levelValue,
    versionsLevel: levelValue,
    locksLevel: levelValue,
  };
}

/** 权限行的展示等级：四维任一 manage+ 即显示「管理」，否则「只读」。 */
function displayedLevel(permission: ImodelUserPermission): AccessLevel {
  const values = [
    permission.briefcasesLevel,
    permission.changesetsLevel,
    permission.versionsLevel,
    permission.locksLevel,
  ];
  return values.some((value) => value === 'manage' || value === 'owner') ? 'manage' : 'read';
}

function BShareDialog({
  doc,
  imodelId,
  isOpen,
  onClose,
}: {
  doc: DocumentSummary;
  imodelId: string;
  isOpen: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const projectId = doc.projectId || doc.id;

  const [activeTab, setActiveTab] = React.useState<'members' | 'invite'>('members');
  const [email, setEmail] = React.useState('');
  const [selectedMemberId, setSelectedMemberId] = React.useState('');
  const [level, setLevel] = React.useState<AccessLevel>('read');
  const [inviteError, setInviteError] = React.useState('');
  const [statusMessage, setStatusMessage] = React.useState<{ kind: 'positive' | 'negative'; text: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<ImodelUserPermission | null>(null);

  const imodelQuery = useQuery({
    queryKey: ['documents', 'share', 'imodel', imodelId],
    queryFn: () => new ImodelsClient().get(imodelId),
    enabled: isOpen && !!imodelId,
    staleTime: 30 * 1000,
  });

  const permissionsQuery = useQuery({
    queryKey: ['documents', 'share', 'imodel-permissions', imodelId],
    queryFn: () => new ImodelsClient().listUserPermissions(imodelId),
    enabled: isOpen && !!imodelId,
    staleTime: 30 * 1000,
  });

  const membersQuery = useQuery({
    queryKey: ['documents', 'share', 'members', projectId],
    queryFn: () => listUserMembers(projectId),
    enabled: isOpen && !!projectId,
    staleTime: 30 * 1000,
  });

  const isSecured =
    ((imodelQuery.data as (IModel & { isSecured?: boolean }) | undefined)?.isSecured) === true;

  const permissions = permissionsQuery.data ?? [];
  const members = membersQuery.data ?? [];

  const invalidatePermissions = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['documents', 'share', 'imodel-permissions', imodelId] });
  }, [imodelId, queryClient]);

  const grantMutation = useMutation({
    mutationFn: (input: { userId: string; level: AccessLevel }) =>
      new ImodelsClient().grantPermission(imodelId, levelPayload(input.userId, input.level)),
    onSuccess: () => {
      invalidatePermissions();
      setStatusMessage({ kind: 'positive', text: t('documents.shareDialog.b.grantSuccess') });
    },
    onError: () => setStatusMessage({ kind: 'negative', text: t('documents.shareDialog.b.grantFailed') }),
  });

  const inviteMutation = useMutation({
    mutationFn: async (input: { email: string; level: AccessLevel }) => {
      const member = await addUserMember(projectId, { email: input.email, roleIds: [] });
      await new ImodelsClient().grantPermission(imodelId, levelPayload(member.id, input.level));
      return member;
    },
    onSuccess: (member) => {
      void queryClient.invalidateQueries({ queryKey: ['documents', 'share', 'members', projectId] });
      invalidatePermissions();
      setEmail('');
      setInviteError('');
      setStatusMessage({
        kind: 'positive',
        text: t('documents.shareDialog.b.addedAndGranted', { email: member.email }),
      });
      setActiveTab('members');
    },
    onError: (error) =>
      setInviteError(error instanceof Error ? error.message : t('documents.shareDialog.b.grantFailed')),
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => new ImodelsClient().revokePermission(imodelId, userId),
    onSuccess: () => {
      invalidatePermissions();
      setRevokeTarget(null);
      setStatusMessage({ kind: 'positive', text: t('documents.shareDialog.b.revokeSuccess') });
    },
    onError: () => setStatusMessage({ kind: 'negative', text: t('documents.shareDialog.b.revokeFailed') }),
  });

  // 切换目标文档时重置页签/状态。
  React.useEffect(() => {
    setActiveTab('members');
    setEmail('');
    setSelectedMemberId('');
    setLevel('read');
    setInviteError('');
    setStatusMessage(null);
    setRevokeTarget(null);
  }, [imodelId]);

  const memberFor = React.useCallback(
    (userId: string): ITwinMember | undefined =>
      members.find((member) => member.id === userId || member.email === userId),
    [members],
  );

  const identityOf = React.useCallback(
    (permission: ImodelUserPermission): string =>
      memberFor(permission.userId)?.email || permission.userId,
    [memberFor],
  );

  /** 已授权的成员标识集合（成员行 id 或 email 形式的 userId）。 */
  const grantedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const permission of permissions) {
      keys.add(permission.userId);
      const member = memberFor(permission.userId);
      if (member) {
        keys.add(member.id);
        keys.add(member.email);
      }
    }
    return keys;
  }, [permissions, memberFor]);

  const grantableMembers = React.useMemo(
    () => members.filter((member) => !grantedKeys.has(member.id) && !grantedKeys.has(member.email)),
    [members, grantedKeys],
  );

  const handleClose = React.useCallback(() => {
    setActiveTab('members');
    setEmail('');
    setSelectedMemberId('');
    setInviteError('');
    setStatusMessage(null);
    setRevokeTarget(null);
    onClose();
  }, [onClose]);

  const handleGrant = React.useCallback(() => {
    if (!selectedMemberId) return;
    grantMutation.mutate({ userId: selectedMemberId, level });
  }, [selectedMemberId, level, grantMutation]);

  const handleInvite = React.useCallback(() => {
    const trimmed = email.trim();
    if (!trimmed) {
      setInviteError(t('documents.shareDialog.invite.emailRequired'));
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setInviteError(t('documents.shareDialog.invite.invalidEmail'));
      return;
    }
    inviteMutation.mutate({ email: trimmed, level });
  }, [email, level, inviteMutation, t]);

  const membersTabLabel = t('documents.shareDialog.tabs.members', { count: permissions.length });

  return (
    <>
      <Dialog isOpen={isOpen} onClose={handleClose} portal isDismissible setFocus>
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('documents.shareDialog.title')}
          className="share-dialog"
        >
          <Dialog.TitleBar titleText={t('documents.shareDialog.title')} />
          <Dialog.Content>
            <Tabs.Wrapper
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as 'members' | 'invite')}
            >
              <Tabs.TabList>
                <Tabs.Tab value="members" label={membersTabLabel} />
                <Tabs.Tab value="invite" label={t('documents.shareDialog.tabs.invite')} />
              </Tabs.TabList>

              <Tabs.Panel value="members" className="share-tab-panel">
                {imodelQuery.data !== undefined && (
                  <Alert type={isSecured ? 'informational' : 'warning'} className="share-alert">
                    {isSecured
                      ? t('documents.shareDialog.b.secured')
                      : t('documents.shareDialog.b.notSecured')}
                  </Alert>
                )}
                {statusMessage && (
                  <Alert type={statusMessage.kind} className="share-alert">
                    {statusMessage.text}
                  </Alert>
                )}
                {permissionsQuery.isLoading ? (
                  <div className="share-members-loading">
                    <ProgressRadial size="small" indeterminate />
                    <Text variant="small">{t('documents.shareDialog.members.loading')}</Text>
                  </div>
                ) : permissionsQuery.isError ? (
                  <div className="share-members-empty">
                    <Alert type="negative" className="share-alert">
                      {t('documents.shareDialog.b.loadFailed')}
                    </Alert>
                    <Button styleType="default" onClick={() => void permissionsQuery.refetch()}>
                      {t('documents.shareDialog.members.retry')}
                    </Button>
                  </div>
                ) : permissions.length === 0 ? (
                  <div className="share-members-empty">
                    <Text variant="body" className="share-empty-title">
                      {t('documents.shareDialog.b.empty')}
                    </Text>
                    <Text variant="small" className="share-empty-desc">
                      {t('documents.shareDialog.b.emptyHint')}
                    </Text>
                  </div>
                ) : (
                  <div className="share-members-list">
                    {permissions.map((permission) => (
                      <div key={permission.id} className="share-member">
                        <div className="share-member__info">
                          <Text className="share-member__email">{identityOf(permission)}</Text>
                          <div className="share-member__meta">
                            <Text variant="small">
                              {displayedLevel(permission) === 'manage'
                                ? t('documents.shareDialog.b.levelManage')
                                : t('documents.shareDialog.b.levelRead')}
                            </Text>
                          </div>
                        </div>
                        <IconButton
                          size="small"
                          styleType="borderless"
                          onClick={() => setRevokeTarget(permission)}
                          label={t('documents.shareDialog.b.revoke')}
                        >
                          <SvgDelete />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}
              </Tabs.Panel>

              <Tabs.Panel value="invite" className="share-tab-panel">
                {inviteError && <Alert type="negative" className="share-alert">{inviteError}</Alert>}

                <div className="share-invite-role">
                  <Label>{t('documents.shareDialog.b.memberSelect')}</Label>
                  {grantableMembers.length > 0 ? (
                    <Select
                      native
                      aria-label={t('documents.shareDialog.b.memberSelect')}
                      value={selectedMemberId}
                      options={[
                        { value: '', label: t('documents.shareDialog.b.memberSelect') },
                        ...grantableMembers.map((member) => ({ value: member.id, label: member.email })),
                      ]}
                      onChange={(value) => setSelectedMemberId(value)}
                      disabled={grantMutation.isPending}
                    />
                  ) : (
                    <Text variant="small" className="share-hint-text">
                      {t('documents.shareDialog.b.noMembers')}
                    </Text>
                  )}
                </div>

                <div className="share-invite-role">
                  <Label>{t('documents.shareDialog.b.levelLabel')}</Label>
                  <Select
                    native
                    aria-label={t('documents.shareDialog.b.levelLabel')}
                    value={level}
                    options={[
                      { value: 'read', label: t('documents.shareDialog.b.levelRead') },
                      { value: 'manage', label: t('documents.shareDialog.b.levelManage') },
                    ]}
                    onChange={(value) => setLevel(value as AccessLevel)}
                    disabled={grantMutation.isPending}
                  />
                </div>

                <Button
                  styleType="high-visibility"
                  onClick={handleGrant}
                  loading={grantMutation.isPending}
                  disabled={grantMutation.isPending || !selectedMemberId}
                  startIcon={<SvgAdd />}
                >
                  {t('documents.shareDialog.b.grant')}
                </Button>

                <div className="share-hint">
                  <Text variant="small">{t('documents.shareDialog.b.inviteHint')}</Text>
                </div>

                <LabeledInput
                  required
                  type="email"
                  label={t('documents.shareDialog.invite.emailLabel')}
                  placeholder={t('documents.shareDialog.invite.emailPlaceholder')}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setInviteError('');
                  }}
                  disabled={inviteMutation.isPending}
                />
                <Button
                  styleType="high-visibility"
                  onClick={handleInvite}
                  loading={inviteMutation.isPending}
                  disabled={inviteMutation.isPending || !email.trim()}
                  startIcon={<SvgAdd />}
                >
                  {t('documents.shareDialog.b.inviteAndGrant')}
                </Button>
              </Tabs.Panel>
            </Tabs.Wrapper>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button styleType="default" onClick={handleClose}>
              {t('documents.shareDialog.close')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>

      {/* 撤销显式权限确认（危险操作 HITL）。 */}
      <Dialog
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        portal
        isDismissible
        setFocus
      >
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('documents.shareDialog.b.revokeTitle')}
          className="share-remove-dialog"
        >
          <Dialog.TitleBar titleText={t('documents.shareDialog.b.revokeTitle')} />
          <Dialog.Content>
            <Text>
              {t('documents.shareDialog.b.revokeMessage', {
                name: revokeTarget ? identityOf(revokeTarget) : '',
              })}
            </Text>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setRevokeTarget(null)}
              disabled={revokeMutation.isPending}
            >
              {t('documents.shareDialog.members.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              className="share-danger-button"
              onClick={() => {
                if (revokeTarget) revokeMutation.mutate(revokeTarget.userId);
              }}
              loading={revokeMutation.isPending}
              disabled={revokeMutation.isPending}
            >
              {t('documents.shareDialog.b.revokeConfirm')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>
    </>
  );
}
