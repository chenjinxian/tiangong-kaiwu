/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * ShareITwinDialog（RW4-P3-T3-2）：S3 access-control 客户端真实现。
 *
 * 契约（shared/services/accessControl/client.ts，官方 UserMembersClient/RolesClient 语义）：
 * - listUserMembers(iTwinId) → ITwinMember[]{id,email,roles:{id,displayName}[]}
 * - listRoles(iTwinId) → {id,displayName}[]（邀请/改角色下拉）
 * - addUserMember(iTwinId,{email,roleIds})（roleIds 复数数组，非 roleId）
 * - updateUserMember PATCH 回 roleIds 形态（UserMemberPatchResult）——只用于确认成功，
 *   渲染不消费该返回值，成功后 invalidate 成员列表重取
 * - removeUserMember(iTwinId, memberId)
 *
 * UI：Tabs 三页（成员/邀请/链接）；移除走确认 Dialog；
 * 链接 = `${origin}/documents/:iTwinId`，复制到剪贴板。
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  IconButton,
  Input,
  InputGroup,
  Label,
  ProgressRadial,
  Select,
  Tabs,
  Tag,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgAdd,
  SvgCheckmark,
  SvgCopy,
  SvgDelete,
} from '@itwin/itwinui-icons-react';
import type { ITwin } from '../../../shared/services/itwins/client.js';
import {
  addUserMember,
  type AddUserMemberRequest,
  type ITwinMember,
  listRoles,
  listUserMembers,
  removeUserMember,
  updateUserMember,
} from '../../../shared/services/accessControl/client.js';
import { queryKeys } from '../../../app/providers/QueryProvider.js';
import { useAppToast } from '../../../shared/hooks/useAppToast.js';
import './ShareITwinDialog.css';

interface ShareITwinDialogProps {
  iTwin: ITwin | null;
  isOpen: boolean;
  onClose: () => void;
}

type ShareTab = 'members' | 'invite' | 'link';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ShareITwinDialog: React.FC<ShareITwinDialogProps> = ({
  iTwin,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation('documents');
  const { showToast } = useAppToast();
  const queryClient = useQueryClient();
  const iTwinId = iTwin?.id ?? null;

  const [activeTab, setActiveTab] = useState<ShareTab>('members');
  const [email, setEmail] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [copied, setCopied] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ITwinMember | null>(null);

  const membersQuery = useQuery({
    queryKey: queryKeys.itwins.members(iTwinId),
    queryFn: async () => listUserMembers(iTwinId as string),
    enabled: isOpen && !!iTwinId,
    staleTime: 30 * 1000,
  });

  const rolesQuery = useQuery({
    queryKey: queryKeys.itwins.roles(iTwinId),
    queryFn: async () => listRoles(iTwinId as string),
    enabled: isOpen && !!iTwinId,
    staleTime: 5 * 60 * 1000,
  });

  const invalidateMembers = useCallback(() => {
    if (!iTwinId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.itwins.members(iTwinId) });
  }, [iTwinId, queryClient]);

  const addMemberMutation = useMutation({
    mutationFn: async (request: AddUserMemberRequest) => addUserMember(iTwinId as string, request),
    onSuccess: invalidateMembers,
  });

  const updateMemberMutation = useMutation({
    // PATCH 返回 roleIds 异形，仅确认成功；列表刷新后由 ITwinMember.roles 渲染
    mutationFn: async ({ memberId, roleIds }: { memberId: string; roleIds: string[] }) =>
      updateUserMember(iTwinId as string, memberId, { roleIds }),
    onSuccess: () => {
      invalidateMembers();
      showToast(t('shareDialog.members.roleUpdated'), 'success');
    },
    onError: () => showToast(t('shareDialog.members.roleUpdateFailed'), 'error'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => removeUserMember(iTwinId as string, memberId),
    onSuccess: () => {
      invalidateMembers();
      setRemoveTarget(null);
      showToast(t('shareDialog.members.removeSuccess'), 'success');
    },
    onError: () => showToast(t('shareDialog.members.removeFailed'), 'error'),
  });

  const roleOptions = useMemo(
    () => (rolesQuery.data ?? []).map((role) => ({ value: role.id, label: role.displayName })),
    [rolesQuery.data],
  );

  // 邀请角色：未手动选择时默认第一个可用角色（无角色则提交空 roleIds）
  const effectiveRoleId = selectedRoleId || roleOptions[0]?.value || '';

  const members = membersQuery.data ?? [];

  const shareLink = iTwinId ? `${window.location.origin}/documents/${iTwinId}` : '';

  const handleClose = useCallback(() => {
    setActiveTab('members');
    setEmail('');
    setSelectedRoleId('');
    setInviteError('');
    setCopied(false);
    setRemoveTarget(null);
    onClose();
  }, [onClose]);

  const handleInvite = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setInviteError(t('shareDialog.invite.emailRequired'));
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setInviteError(t('shareDialog.invite.invalidEmail'));
      return;
    }

    try {
      await addMemberMutation.mutateAsync({
        email: trimmed,
        roleIds: effectiveRoleId ? [effectiveRoleId] : [],
      });
      setInviteError('');
      setEmail('');
      showToast(t('shareDialog.invite.success', { email: trimmed }), 'success');
      // 邀请即成员（本 hub POST members/users 直接加人）——切回成员页看结果
      setActiveTab('members');
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : t('shareDialog.invite.failed'));
    }
  }, [email, effectiveRoleId, addMemberMutation, showToast, t]);

  const handleRoleChange = useCallback((member: ITwinMember, roleId: string) => {
    updateMemberMutation.mutate({
      memberId: member.id,
      roleIds: roleId ? [roleId] : [],
    });
  }, [updateMemberMutation]);

  const handleConfirmRemove = useCallback(() => {
    if (removeTarget) {
      removeMemberMutation.mutate(removeTarget.id);
    }
  }, [removeTarget, removeMemberMutation]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用（权限/非安全上下文）——保持静默，输入框可手动复制
    }
  }, [shareLink]);

  if (!iTwin) return null;

  const membersTabLabel = t('shareDialog.tabs.members', { count: members.length });

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={handleClose}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('shareDialog.title')}
          className="share-dialog"
        >
          <Dialog.TitleBar title={t('shareDialog.title')} />
          <Dialog.Content>
            <Tabs.Wrapper
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as ShareTab)}
            >
              <Tabs.TabList>
                <Tabs.Tab value="members" label={membersTabLabel} />
                <Tabs.Tab value="invite" label={t('shareDialog.tabs.invite')} />
                <Tabs.Tab value="link" label={t('shareDialog.tabs.link')} />
              </Tabs.TabList>

              {/* 成员 */}
              <Tabs.Panel value="members" className="share-tab-panel">
                {membersQuery.isLoading ? (
                  <div className="share-members-loading">
                    <ProgressRadial size="small" indeterminate />
                    <Text variant="small">{t('shareDialog.members.loading')}</Text>
                  </div>
                ) : membersQuery.isError ? (
                  <div className="share-members-empty">
                    <Alert type="negative" className="share-alert">
                      {t('shareDialog.members.loadFailed')}
                    </Alert>
                    <Button
                      styleType="default"
                      onClick={() => void membersQuery.refetch()}
                    >
                      {t('shareDialog.members.retry')}
                    </Button>
                  </div>
                ) : members.length === 0 ? (
                  <div className="share-members-empty">
                    <Text variant="body" className="share-empty-title">
                      {t('shareDialog.members.empty')}
                    </Text>
                    <Text variant="small" className="share-empty-desc">
                      {t('shareDialog.members.emptyHint')}
                    </Text>
                  </div>
                ) : (
                  <div className="share-members-list">
                    {members.map((member) => {
                      const roleLabel = member.roles
                        .map((role) => role.displayName)
                        .filter(Boolean)
                        .join(', ');
                      return (
                        <div key={member.id} className="share-member">
                          <div className="share-member__info">
                            <Text className="share-member__email">{member.email}</Text>
                            <div className="share-member__meta">
                              {roleOptions.length > 0 ? (
                                <Select
                                  native
                                  size="small"
                                  aria-label={t('shareDialog.members.roleLabel')}
                                  value={member.roles[0]?.id ?? ''}
                                  options={[
                                    { value: '', label: t('shareDialog.members.noRole') },
                                    ...roleOptions,
                                  ]}
                                  onChange={(value) => handleRoleChange(member, value)}
                                />
                              ) : (
                                <Tag>{roleLabel || t('shareDialog.members.noRole')}</Tag>
                              )}
                            </div>
                          </div>
                          <IconButton
                            size="small"
                            styleType="borderless"
                            onClick={() => setRemoveTarget(member)}
                            label={t('shareDialog.members.remove')}
                          >
                            <SvgDelete />
                          </IconButton>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Tabs.Panel>

              {/* 邀请 */}
              <Tabs.Panel value="invite" className="share-tab-panel">
                {inviteError && (
                  <Alert type="negative" className="share-alert">{inviteError}</Alert>
                )}

                <InputGroup>
                  <Label required htmlFor="share-invite-email">
                    {t('shareDialog.invite.emailLabel')}
                  </Label>
                  <Input
                    id="share-invite-email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setInviteError('');
                    }}
                    placeholder={t('shareDialog.invite.emailPlaceholder')}
                    type="email"
                    disabled={addMemberMutation.isPending}
                  />
                </InputGroup>

                <InputGroup>
                  <Label htmlFor="share-invite-role">{t('shareDialog.invite.roleLabel')}</Label>
                  {roleOptions.length > 0 ? (
                    <Select
                      native
                      triggerProps={{ id: 'share-invite-role' }}
                      value={effectiveRoleId}
                      options={roleOptions}
                      onChange={(value) => setSelectedRoleId(value)}
                      disabled={addMemberMutation.isPending}
                    />
                  ) : (
                    <Text variant="small" className="share-hint-text">
                      {t('shareDialog.invite.noRoles')}
                    </Text>
                  )}
                </InputGroup>

                <div className="share-hint">
                  <Text variant="small">{t('shareDialog.invite.hint')}</Text>
                </div>

                <Button
                  styleType="high-visibility"
                  onClick={() => void handleInvite()}
                  loading={addMemberMutation.isPending}
                  disabled={addMemberMutation.isPending || !email.trim()}
                  startIcon={<SvgAdd />}
                >
                  {t('shareDialog.invite.submit')}
                </Button>
              </Tabs.Panel>

              {/* 链接 */}
              <Tabs.Panel value="link" className="share-tab-panel">
                <div className="share-link-section">
                  <Label htmlFor="share-link-input">{t('shareDialog.link.label')}</Label>
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
                      label={copied ? t('shareDialog.link.copied') : t('shareDialog.link.copy')}
                    >
                      {copied ? <SvgCheckmark /> : <SvgCopy />}
                    </IconButton>
                  </div>
                  <Text variant="small" className="share-link-hint">
                    {t('shareDialog.link.hint')}
                  </Text>
                </div>
              </Tabs.Panel>
            </Tabs.Wrapper>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button styleType="default" onClick={handleClose}>
              {t('shareDialog.close')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>

      {/* 移除成员确认（危险操作标准形态） */}
      <Dialog
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        portal
        isDismissible
      >
        <Dialog.Backdrop />
        <Dialog.Main
          styleType="default"
          title={t('shareDialog.members.removeTitle')}
          className="share-remove-dialog"
        >
          <Dialog.TitleBar title={t('shareDialog.members.removeTitle')} />
          <Dialog.Content>
            <Text>
              {t('shareDialog.members.removeMessage', { email: removeTarget?.email ?? '' })}
            </Text>
          </Dialog.Content>
          <Dialog.ButtonBar>
            <Button
              styleType="default"
              onClick={() => setRemoveTarget(null)}
              disabled={removeMemberMutation.isPending}
            >
              {t('shareDialog.members.cancel')}
            </Button>
            <Button
              styleType="high-visibility"
              className="share-danger-button"
              onClick={handleConfirmRemove}
              loading={removeMemberMutation.isPending}
              disabled={removeMemberMutation.isPending}
            >
              {t('shareDialog.members.confirmRemove')}
            </Button>
          </Dialog.ButtonBar>
        </Dialog.Main>
      </Dialog>
    </>
  );
};
