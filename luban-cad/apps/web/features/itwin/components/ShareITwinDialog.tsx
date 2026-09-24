/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useCallback } from 'react';
import {
  Button,
  Dialog,
  InputGroup,
  Label,
  Input,
  Text,
  Alert,
  Select,
  IconButton,
  Tabs,
} from '@itwin/itwinui-react';
import {
  SvgCopy,
  SvgCheckmark,
  SvgAdd,
  SvgDelete,
} from '@itwin/itwinui-icons-react';
import type { ITwin } from '../../../shared/services/itwins/client.js';
import './ShareITwinDialog.css';

interface ShareITwinDialogProps {
  iTwin: ITwin | null;
  isOpen: boolean;
  onClose: () => void;
}

interface Member {
  id: string;
  email: string;
  role: 'viewer' | 'editor' | 'admin';
  status: 'pending' | 'active';
}

const ROLE_OPTIONS = [
  { value: 'viewer', label: '查看者 - 只能查看' },
  { value: 'editor', label: '编辑者 - 可以编辑' },
  { value: 'admin', label: '管理员 - 完全控制' },
];

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ShareITwinDialog: React.FC<ShareITwinDialogProps> = ({
  iTwin,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'invite' | 'members' | 'link'>('invite');
  const [email, setEmail] = useState('');
  const [selectedRole, setSelectedRole] = useState<'viewer' | 'editor' | 'admin'>('viewer');
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkPermission, setLinkPermission] = useState<'viewer' | 'none'>('viewer');
  const [editingMember, setEditingMember] = useState<string | null>(null);

  // Generate share link
  const shareLink = iTwin?.id
    ? `${window.location.origin}/itwins/${iTwin.id}?share=${linkPermission !== 'none'}`
    : '';

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copy failed
    }
  }, [shareLink]);

  const handleInvite = useCallback(async () => {
    if (!email.trim()) {
      setError('请输入邮箱地址');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Add to members list (mock)
    const newMember: Member = {
      id: Date.now().toString(),
      email: email.trim(),
      role: selectedRole,
      status: 'pending',
    };
    setMembers(prev => [...prev, newMember]);
    setSuccess(`邀请已发送至 ${email}`);
    setEmail('');
    setIsLoading(false);
  }, [email, selectedRole]);

  const handleRemoveMember = useCallback((memberId: string) => {
    setMembers(prev => prev.filter(m => m.id !== memberId));
  }, []);

  const handleUpdateMemberRole = useCallback((memberId: string, newRole: 'viewer' | 'editor' | 'admin') => {
    setMembers(prev =>
      prev.map(m =>
        m.id === memberId ? { ...m, role: newRole } : m
      )
    );
    setEditingMember(null);
  }, []);

  const handleLinkPermissionChange = useCallback((value: string) => {
    setLinkPermission(value as 'viewer' | 'none');
  }, []);

  const handleClose = useCallback(() => {
    setEmail('');
    setError('');
    setSuccess('');
    setActiveTab('invite');
    setLinkPermission('viewer');
    setEditingMember(null);
    onClose();
  }, [onClose]);

  if (!iTwin) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      portal
      isDismissible
    >
      <Dialog.Backdrop />
      <Dialog.Main styleType="default" className="share-dialog">
        <Dialog.TitleBar title="分享项目" onClose={handleClose} />
        <Dialog.Content>
          <Tabs.Wrapper value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <Tabs.TabList>
              <Tabs.Tab value="invite" label="邀请成员" />
              <Tabs.Tab value="members" label={`成员 (${members.length})`} />
              <Tabs.Tab value="link" label="分享链接" />
            </Tabs.TabList>

            {/* Invite Tab */}
            <Tabs.Panel value="invite" className="share-tab-panel">
              {error && <Alert type="negative" className="share-alert">{error}</Alert>}
              {success && <Alert type="positive" className="share-alert">{success}</Alert>}

              <InputGroup>
                <Label required>邮箱地址</Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  type="email"
                  disabled={isLoading}
                />
              </InputGroup>

              <InputGroup>
                <Label>权限</Label>
                <Select
                  value={selectedRole}
                  options={ROLE_OPTIONS}
                  onChange={(value) => setSelectedRole(value as typeof selectedRole)}
                  disabled={isLoading}
                />
              </InputGroup>

              <div className="share-hint">
                <Text variant="small">
                  受邀者将收到邮件通知。如果他们没有账户，将会被引导注册。
                </Text>
              </div>

              <Button
                styleType="high-visibility"
                onClick={handleInvite}
                loading={isLoading}
                disabled={isLoading || !email.trim()}
                startIcon={<SvgAdd />}
              >
                发送邀请
              </Button>
            </Tabs.Panel>

            {/* Members Tab */}
            <Tabs.Panel value="members" className="share-tab-panel">
              {members.length === 0 ? (
                <div className="members-empty">
                  <Text variant="body" className="empty-title">暂无成员</Text>
                  <Text variant="small" className="empty-desc">
                    在"邀请成员"标签中添加团队成员
                  </Text>
                </div>
              ) : (
                <div className="members-list">
                  {members.map(member => (
                    <div key={member.id} className="member-item">
                      <div className="member-info">
                        <Text className="member-email">{member.email}</Text>
                        <div className="member-meta">
                          {editingMember === member.id ? (
                            <Select
                              value={member.role}
                              options={ROLE_OPTIONS}
                              onChange={(value) => handleUpdateMemberRole(member.id, value as typeof member.role)}
                              size="small"
                            />
                          ) : (
                            <button
                              className={`member-role role-${member.role}`}
                              onClick={() => setEditingMember(member.id)}
                              title="点击修改角色"
                            >
                              {ROLE_OPTIONS.find(r => r.value === member.role)?.label.split(' - ')[0]}
                            </button>
                          )}
                          {member.status === 'pending' && (
                            <span className="member-status">待接受</span>
                          )}
                        </div>
                      </div>
                      <IconButton
                        size="small"
                        styleType="borderless"
                        onClick={() => handleRemoveMember(member.id)}
                        label="移除成员"
                      >
                        <SvgDelete />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </Tabs.Panel>

            {/* Link Tab */}
            <Tabs.Panel value="link" className="share-tab-panel">
              <div className="link-section">
                <Label>分享链接</Label>
                <div className="link-input-group">
                  <Input
                    value={shareLink}
                    readOnly
                    className="link-input"
                  />
                  <IconButton
                    styleType="default"
                    onClick={handleCopyLink}
                    label={copied ? '已复制' : '复制链接'}
                  >
                    {copied ? <SvgCheckmark /> : <SvgCopy />}
                  </IconButton>
                </div>
                <Text variant="small" className="link-hint">
                  任何拥有此链接的人都可以查看此项目
                </Text>
              </div>

              <div className="link-permissions">
                <Label>链接权限</Label>
                <Select
                  value={linkPermission}
                  options={[
                    { value: 'viewer', label: '任何人都可以查看' },
                    { value: 'none', label: '需要登录才能查看' },
                  ]}
                  onChange={handleLinkPermissionChange}
                />
              </div>
            </Tabs.Panel>
          </Tabs.Wrapper>
        </Dialog.Content>
        <Dialog.ButtonBar>
          <Button styleType="default" onClick={handleClose}>
            关闭
          </Button>
        </Dialog.ButtonBar>
      </Dialog.Main>
    </Dialog>
  );
};
