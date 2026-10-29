/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * ShareDocumentDialog（Task 5）：移植自旧应用
 * apps/web features/itwin/components/ShareITwinDialog.tsx——Tabs 三页签
 * （成员/邀请/链接），数据面改接本模块 internal/share.api.ts（hub REST，
 * token 经 AuthSession.getValidAccessToken 单飞刷新）。
 *
 * 与旧实现的差异（适配裁决）：
 * - 入参 iTwin → doc（DocumentSummary，Task 4 UI 契约）；
 * - toast 反馈（useAppToast）→ 成员页内联状态条（web 暂无全局 toast
 *   设施，成功/失败在成员页顶部 Alert 呈现，语义等价可测）；
 * - queryKeys 集中注册表 → 本组件内联键（['documents','share',...]，
 *   web 暂无 queryKeys 注册表）；
 * - 成员 id 非 UUID 时禁用改角色/移除（hub PATCH/DELETE 走 ParseUUIDPipe，
 *   非 UUID id 必 400——旧应用同口径 inline 说明）。
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
}

type ShareTab = 'members' | 'invite' | 'link';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ShareDocumentDialog({
  doc,
  isOpen,
  onClose,
}: ShareDocumentDialogProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const iTwinId = doc?.id ?? null;

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
    queryFn: async () => listUserMembers(iTwinId ?? ''),
    enabled: isOpen && !!iTwinId,
    staleTime: 30 * 1000,
  });

  const rolesQuery = useQuery({
    queryKey: ['documents', 'share', 'roles', iTwinId],
    queryFn: async () => listRoles(iTwinId ?? ''),
    enabled: isOpen && !!iTwinId,
    staleTime: 5 * 60 * 1000,
  });

  const invalidateMembers = React.useCallback(() => {
    if (!iTwinId) return;
    void queryClient.invalidateQueries({ queryKey: ['documents', 'share', 'members', iTwinId] });
  }, [iTwinId, queryClient]);

  const addMemberMutation = useMutation({
    mutationFn: (request: AddUserMemberRequest) => addUserMember(iTwinId ?? '', request),
    onSuccess: invalidateMembers,
  });

  const updateMemberMutation = useMutation({
    // PATCH 返回 roleIds 异形，仅确认成功；列表刷新后由 ITwinMember.roles 渲染
    mutationFn: (input: { memberId: string; roleIds: string[] }) =>
      updateUserMember(iTwinId ?? '', input.memberId, { roleIds: input.roleIds }),
    onSuccess: () => {
      invalidateMembers();
      setStatusMessage({ kind: 'positive', text: t('documents.shareDialog.members.roleUpdated') });
    },
    onError: () => setStatusMessage({ kind: 'negative', text: t('documents.shareDialog.members.roleUpdateFailed') }),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => removeUserMember(iTwinId ?? '', memberId),
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

  if (!doc) return null;

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
