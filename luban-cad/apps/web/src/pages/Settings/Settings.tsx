/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Label,
  Text,
  Avatar,
  Alert,
  Divider,
} from '@itwin/itwinui-react';
import {
  SvgChevronLeft,
  SvgUser,
  SvgLock,
  SvgNotification,
} from '@itwin/itwinui-icons-react';
import { useUser } from '../../../app/contexts/UserContext.js';
import { ThemeToggle } from '../../../features/editor/components/ThemeToggle.js';
import { useToast } from '../../../shared/components/ui/ToastContainer.js';
import './Settings.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001';

/**
 * Update user profile via backend API
 */
async function updateUserProfile(name: string, accessToken: string): Promise<{ id: string; email: string; name: string }> {
  const response = await fetch(`${API_BASE_URL}/api/users/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to update profile');
  }

  const data = await response.json();
  return data.user;
}

/**
 * Change user password via backend API
 */
async function changeUserPassword(currentPassword: string, newPassword: string, accessToken: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/users/password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to change password');
  }
}

/**
 * Settings page - User profile and application settings
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const Settings: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const { user, updateUser } = useUser();
  const { showToast, ToastContainer } = useToast();

  const [activeTab, setActiveTab] = useState<'profile' | 'password' | 'preferences'>('profile');

  // Profile form state
  const [name, setName] = useState(user?.name || '');
  const email = user?.email || '';
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleBack = useCallback(() => {
    navigate('/itwins');
  }, [navigate]);

  const handleUpdateProfile = useCallback(async () => {
    if (!name.trim()) {
      showToast('请输入姓名', 'error');
      return;
    }

    setIsUpdatingProfile(true);
    try {
      // Get access token from auth client
      const { getValidAccessToken } = await import('../../../features/auth/services/auth/client.js');
      const accessToken = await getValidAccessToken();

      // Call backend API to update profile
      const updatedUser = await updateUserProfile(name.trim(), accessToken);

      // Update local user state
      updateUser({ name: updatedUser.name });
      showToast('个人资料已更新', 'success');
    } catch (error) {
      console.error('[Settings] Profile update failed:', error);
      showToast(error instanceof Error ? error.message : '更新失败，请重试', 'error');
    } finally {
      setIsUpdatingProfile(false);
    }
  }, [name, updateUser, showToast]);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword) {
      showToast('请输入当前密码', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast('新密码至少需要6个字符', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('两次输入的新密码不一致', 'error');
      return;
    }

    setIsChangingPassword(true);
    try {
      // Get access token from auth client
      const { getValidAccessToken } = await import('../../../features/auth/services/auth/client.js');
      const accessToken = await getValidAccessToken();

      // Call backend API to change password
      await changeUserPassword(currentPassword, newPassword, accessToken);

      showToast('密码已修改，请使用新密码重新登录', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('[Settings] Password change failed:', error);
      showToast(error instanceof Error ? error.message : '密码修改失败，请检查当前密码', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword, showToast]);

  const handleAvatarUpload = useCallback(() => {
    // Avatar upload not yet implemented - will be added in a future update
    showToast('头像上传功能即将上线', 'info');
  }, [showToast]);

  return (
    <div className="settings-page">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo-mark">CC</div>
          <nav className="breadcrumb">
            <Button styleType="borderless" onClick={handleBack} startIcon={<SvgChevronLeft />}>
              返回
            </Button>
            <Text className="breadcrumb-sep">/</Text>
            <Text className="breadcrumb-current">设置</Text>
          </nav>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <Avatar
            title={user?.name || user?.email}
            abbreviation={(user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase()}
          />
        </div>
      </header>

      {/* Main content */}
      <div className="settings-content">
        <div className="settings-layout">
          {/* Sidebar */}
          <aside className="settings-sidebar">
            <div className="user-preview">
              <div className="avatar-wrapper" onClick={handleAvatarUpload}>
                <Avatar
                  size="x-large"
                  abbreviation={(user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase()}
                  title={user?.name || user?.email}
                  className="user-avatar"
                />
                <div className="avatar-overlay">
                  <Text variant="small">更换</Text>
                </div>
              </div>
              <Text variant="title" className="user-name">{user?.name || '用户'}</Text>
              <Text variant="small" className="user-email">{user?.email}</Text>
            </div>

            <Divider />

            <nav className="settings-nav">
              <button
                className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                <SvgUser />
                <span>个人资料</span>
              </button>
              <button
                className={`nav-item ${activeTab === 'password' ? 'active' : ''}`}
                onClick={() => setActiveTab('password')}
              >
                <SvgLock />
                <span>修改密码</span>
              </button>
              <button
                className={`nav-item ${activeTab === 'preferences' ? 'active' : ''}`}
                onClick={() => setActiveTab('preferences')}
              >
                <SvgNotification />
                <span>偏好设置</span>
              </button>
            </nav>
          </aside>

          {/* Content area */}
          <main className="settings-main">
            {activeTab === 'profile' && (
              <div className="settings-section">
                <Text variant="title" className="section-title">个人资料</Text>
                <Text variant="small" className="section-description">
                  管理您的个人信息和公开资料
                </Text>

                <div className="form-group">
                  <Label htmlFor="name" required>姓名</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="输入您的姓名"
                  />
                </div>

                <div className="form-group">
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    value={email}
                    disabled
                    placeholder="您的邮箱地址"
                  />
                  <Text variant="small" className="field-hint">
                    邮箱地址不可修改
                  </Text>
                </div>

                <div className="form-actions">
                  <Button
                    styleType="high-visibility"
                    onClick={handleUpdateProfile}
                    loading={isUpdatingProfile}
                    disabled={isUpdatingProfile || name === user?.name}
                  >
                    保存修改
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'password' && (
              <div className="settings-section">
                <Text variant="title" className="section-title">修改密码</Text>
                <Text variant="small" className="section-description">
                  定期更换密码可以提高账户安全性
                </Text>

                <Alert type="informational" className="password-hint">
                  密码应包含至少6个字符，建议使用字母、数字和特殊字符的组合
                </Alert>

                <div className="form-group">
                  <Label htmlFor="currentPassword" required>当前密码</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="输入当前密码"
                  />
                </div>

                <div className="form-group">
                  <Label htmlFor="newPassword" required>新密码</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="输入新密码"
                  />
                </div>

                <div className="form-group">
                  <Label htmlFor="confirmPassword" required>确认新密码</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入新密码"
                  />
                </div>

                <div className="form-actions">
                  <Button
                    styleType="high-visibility"
                    onClick={handleChangePassword}
                    loading={isChangingPassword}
                    disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
                  >
                    修改密码
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'preferences' && (
              <div className="settings-section">
                <Text variant="title" className="section-title">偏好设置</Text>
                <Text variant="small" className="section-description">
                  自定义您的应用体验
                </Text>

                <div className="preference-item">
                  <div className="preference-info">
                    <Text variant="body">主题</Text>
                    <Text variant="small" className="preference-desc">
                      选择浅色或深色主题
                    </Text>
                  </div>
                  <ThemeToggle />
                </div>

                <Divider />

                <div className="preference-item">
                  <div className="preference-info">
                    <Text variant="body">自动保存</Text>
                    <Text variant="small" className="preference-desc">
                      编辑时自动保存更改（即将上线）
                    </Text>
                  </div>
                  <Button styleType="default" disabled>配置</Button>
                </div>

                <Divider />

                <div className="preference-item">
                  <div className="preference-info">
                    <Text variant="body">通知</Text>
                    <Text variant="small" className="preference-desc">
                      管理邮件和应用内通知（即将上线）
                    </Text>
                  </div>
                  <Button styleType="default" disabled>配置</Button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      <ToastContainer />
    </div>
  );
});

Settings.displayName = 'Settings';

export default Settings;
