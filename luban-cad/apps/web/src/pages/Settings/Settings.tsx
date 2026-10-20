/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Button,
  Divider,
  Input,
  Label,
  Select,
  Tabs,
  Text,
} from '@itwin/itwinui-react';
import {
  SvgChevronLeft,
  SvgLock,
  SvgSettings,
  SvgUser,
} from '@itwin/itwinui-icons-react';
import { useUser } from '../../../app/contexts/UserContext.js';
import { ThemeToggle } from '../../../features/editor/components/ThemeToggle.js';
import { useAppToast } from '../../../shared/hooks/useAppToast.js';
import { API_BASE_URL } from '../../../shared/api/baseUrl.js';
import { ApiError, fetchWithAuth } from '../../../shared/api/httpClient.js';
import i18n, { LANGUAGE_STORAGE_KEY } from '../../../shared/i18n/index.js';
import './Settings.css';

type SettingsTab = 'profile' | 'password' | 'preferences';
type LengthUnit = 'mm' | 'inch';

/** 长度单位偏好（仅本机持久化；当前不影响建模与导出） */
export const LENGTH_UNIT_STORAGE_KEY = 'luban-cad-length-unit';

interface ProfileResponse {
  user?: {
    name?: string;
  };
}

interface PasswordPayload {
  currentPassword: string;
  newPassword: string;
}

/**
 * Settings page - User profile, password and application preferences
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
const Settings: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const { t } = useTranslation('settings');
  const { user, updateUser } = useUser();
  const { showToast } = useAppToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Profile form state
  const [name, setName] = useState(user?.name || '');
  const [profileError, setProfileError] = useState('');
  const email = user?.email || '';

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Preferences：语言 / 长度单位（本机 localStorage）
  const [language, setLanguage] = useState(() =>
    i18n.language.startsWith('en') ? 'en' : 'zh-CN',
  );
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>(() =>
    localStorage.getItem(LENGTH_UNIT_STORAGE_KEY) === 'inch' ? 'inch' : 'mm',
  );

  const profileMutation = useMutation({
    mutationFn: async (nextName: string) => {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/users/profile`, {
        method: 'PUT',
        body: JSON.stringify({ name: nextName }),
      });
      return (await response.json()) as ProfileResponse;
    },
    onSuccess: (data, nextName) => {
      // 后端回显优先，缺失时回落到提交值——同步顶栏/侧栏用户信息
      const resolvedName = data.user?.name ?? nextName;
      setName(resolvedName);
      updateUser({ name: resolvedName });
      showToast(t('profile.success'), 'success');
    },
    onError: (error: Error) => {
      showToast(error instanceof ApiError ? error.message : t('profile.failed'), 'error');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async (payload: PasswordPayload) => {
      await fetchWithAuth(`${API_BASE_URL}/api/users/password`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast(t('password.success'), 'success');
    },
    onError: (error: Error) => {
      showToast(error instanceof ApiError ? error.message : t('password.failed'), 'error');
    },
  });

  const handleBack = useCallback(() => {
    navigate('/documents');
  }, [navigate]);

  const handleNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
    setProfileError('');
  }, []);

  const handleUpdateProfile = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setProfileError(t('profile.validation.nameRequired'));
      return;
    }
    setProfileError('');
    profileMutation.mutate(trimmed);
  }, [name, profileMutation, t]);

  const handleChangePassword = useCallback(() => {
    if (!currentPassword) {
      showToast(t('password.validation.currentRequired'), 'error');
      return;
    }
    if (newPassword.length < 6) {
      showToast(t('password.validation.newTooShort'), 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast(t('password.validation.mismatch'), 'error');
      return;
    }
    passwordMutation.mutate({ currentPassword, newPassword });
  }, [currentPassword, newPassword, confirmPassword, passwordMutation, showToast, t]);

  const handleLanguageChange = useCallback((value: string) => {
    const nextLanguage = value === 'en' ? 'en' : 'zh-CN';
    setLanguage(nextLanguage);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    void i18n.changeLanguage(nextLanguage);
  }, []);

  const handleLengthUnitChange = useCallback((value: string) => {
    const nextUnit: LengthUnit = value === 'inch' ? 'inch' : 'mm';
    setLengthUnit(nextUnit);
    localStorage.setItem(LENGTH_UNIT_STORAGE_KEY, nextUnit);
  }, []);

  const handleAvatarUpload = useCallback(() => {
    // 头像上传尚未接入存储服务——诚实提示，不做假交互
    showToast(t('profile.avatarComingSoon'), 'info');
  }, [showToast, t]);

  const displayName = user?.name || user?.email || t('user.fallbackName');
  const avatarAbbreviation = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="settings-page">
      {/* Topbar */}
      <header className="settings-topbar">
        <div className="settings-topbar-left">
          <Button
            styleType="borderless"
            onClick={handleBack}
            startIcon={<SvgChevronLeft />}
          >
            {t('back')}
          </Button>
          <Text className="settings-breadcrumb-sep" aria-hidden="true">/</Text>
          <Text className="settings-breadcrumb-current">{t('title')}</Text>
        </div>
        <div className="settings-topbar-actions">
          <ThemeToggle />
          <Avatar title={displayName} abbreviation={avatarAbbreviation} />
        </div>
      </header>

      {/* Main content */}
      <div className="settings-content">
        <Tabs.Wrapper
          className="settings-layout"
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
        >
          {/* 左侧用户预览 + 标签导航 */}
          <aside className="settings-sidebar">
            <div className="user-preview">
              <button
                type="button"
                className="avatar-wrapper"
                onClick={handleAvatarUpload}
                aria-label={t('user.avatarLabel')}
              >
                <Avatar
                  size="x-large"
                  abbreviation={avatarAbbreviation}
                  title={displayName}
                  className="user-avatar"
                />
                <span className="avatar-overlay" aria-hidden="true">
                  <Text variant="small">{t('user.changeAvatar')}</Text>
                </span>
              </button>
              <Text variant="title" className="user-name">{displayName}</Text>
              {user?.email && (
                <Text variant="small" className="user-email">{user.email}</Text>
              )}
            </div>

            <Divider />

            <Tabs.TabList className="settings-tablist">
              <Tabs.Tab value="profile">
                <Tabs.TabIcon><SvgUser /></Tabs.TabIcon>
                <Tabs.TabLabel>{t('tabs.profile')}</Tabs.TabLabel>
              </Tabs.Tab>
              <Tabs.Tab value="password">
                <Tabs.TabIcon><SvgLock /></Tabs.TabIcon>
                <Tabs.TabLabel>{t('tabs.password')}</Tabs.TabLabel>
              </Tabs.Tab>
              <Tabs.Tab value="preferences">
                <Tabs.TabIcon><SvgSettings /></Tabs.TabIcon>
                <Tabs.TabLabel>{t('tabs.preferences')}</Tabs.TabLabel>
              </Tabs.Tab>
            </Tabs.TabList>
          </aside>

          {/* Content area */}
          <main className="settings-main">
            <Tabs.Panel value="profile" className="settings-section">
              <Text variant="title" className="section-title">{t('profile.title')}</Text>
              <Text variant="small" className="section-description">
                {t('profile.description')}
              </Text>

              <div className="form-group">
                <Label htmlFor="settings-name" required>{t('profile.nameLabel')}</Label>
                <Input
                  id="settings-name"
                  value={name}
                  onChange={handleNameChange}
                  placeholder={t('profile.namePlaceholder')}
                  autoComplete="name"
                  status={profileError ? 'negative' : undefined}
                  aria-invalid={!!profileError}
                  aria-describedby={profileError ? 'settings-name-error' : undefined}
                />
                {profileError && (
                  <span id="settings-name-error" className="field-error" role="alert">
                    {profileError}
                  </span>
                )}
              </div>

              <div className="form-group">
                <Label htmlFor="settings-email">{t('profile.emailLabel')}</Label>
                <Input
                  id="settings-email"
                  value={email}
                  disabled
                />
                <Text variant="small" className="field-hint">
                  {t('profile.emailHint')}
                </Text>
              </div>

              <div className="form-actions">
                <Button
                  styleType="high-visibility"
                  onClick={handleUpdateProfile}
                  loading={profileMutation.isPending}
                  disabled={profileMutation.isPending || name === user?.name}
                >
                  {t('profile.save')}
                </Button>
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="password" className="settings-section">
              <Text variant="title" className="section-title">{t('password.title')}</Text>
              <Text variant="small" className="section-description">
                {t('password.description')}
              </Text>

              <Alert type="informational" className="password-hint">
                {t('password.hint')}
              </Alert>

              <div className="form-group">
                <Label htmlFor="settings-current-password" required>
                  {t('password.currentLabel')}
                </Label>
                <Input
                  id="settings-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder={t('password.currentPlaceholder')}
                  autoComplete="current-password"
                />
              </div>

              <div className="form-group">
                <Label htmlFor="settings-new-password" required>
                  {t('password.newLabel')}
                </Label>
                <Input
                  id="settings-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder={t('password.newPlaceholder')}
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <Label htmlFor="settings-confirm-password" required>
                  {t('password.confirmLabel')}
                </Label>
                <Input
                  id="settings-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder={t('password.confirmPlaceholder')}
                  autoComplete="new-password"
                />
              </div>

              <div className="form-actions">
                <Button
                  styleType="high-visibility"
                  onClick={handleChangePassword}
                  loading={passwordMutation.isPending}
                  disabled={
                    passwordMutation.isPending ||
                    !currentPassword ||
                    !newPassword ||
                    !confirmPassword
                  }
                >
                  {t('password.submit')}
                </Button>
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="preferences" className="settings-section">
              <Text variant="title" className="section-title">
                {t('preferences.title')}
              </Text>
              <Text variant="small" className="section-description">
                {t('preferences.description')}
              </Text>

              <div className="preference-item">
                <div className="preference-info">
                  <Text variant="body" className="preference-label">
                    {t('preferences.themeLabel')}
                  </Text>
                  <Text variant="small" className="preference-desc">
                    {t('preferences.themeDescription')}
                  </Text>
                </div>
                <div className="preference-control">
                  <ThemeToggle />
                </div>
              </div>

              <Divider />

              <div className="preference-item">
                <div className="preference-info">
                  <Label htmlFor="settings-language" className="preference-label">
                    {t('preferences.languageLabel')}
                  </Label>
                  <Text variant="small" className="preference-desc">
                    {t('preferences.languageDescription')}
                  </Text>
                </div>
                <Select
                  native
                  className="preference-control"
                  triggerProps={{ id: 'settings-language' }}
                  value={language}
                  options={[
                    { value: 'zh-CN', label: t('preferences.languageZh') },
                    { value: 'en', label: t('preferences.languageEn') },
                  ]}
                  onChange={handleLanguageChange}
                />
              </div>

              <Divider />

              <div className="preference-item">
                <div className="preference-info">
                  <Label htmlFor="settings-length-unit" className="preference-label">
                    {t('preferences.unitLabel')}
                  </Label>
                  <Text variant="small" className="preference-desc">
                    {t('preferences.unitDescription')}
                  </Text>
                </div>
                <Select
                  native
                  className="preference-control"
                  triggerProps={{ id: 'settings-length-unit' }}
                  value={lengthUnit}
                  options={[
                    { value: 'mm', label: t('preferences.unitMm') },
                    { value: 'inch', label: t('preferences.unitInch') },
                  ]}
                  onChange={handleLengthUnitChange}
                />
              </div>

              <Text variant="small" className="preference-note">
                {t('preferences.unitNote')}
              </Text>

              <Divider />

              <div className="preference-item">
                <div className="preference-info">
                  <Text variant="body" className="preference-label">
                    {t('preferences.autoSaveLabel')}
                  </Text>
                  <Text variant="small" className="preference-desc">
                    {t('preferences.autoSaveDescription')}
                  </Text>
                </div>
                <Button styleType="default" disabled>
                  {t('preferences.comingSoon')}
                </Button>
              </div>

              <Divider />

              <div className="preference-item">
                <div className="preference-info">
                  <Text variant="body" className="preference-label">
                    {t('preferences.notificationsLabel')}
                  </Text>
                  <Text variant="small" className="preference-desc">
                    {t('preferences.notificationsDescription')}
                  </Text>
                </div>
                <Button styleType="default" disabled>
                  {t('preferences.comingSoon')}
                </Button>
              </div>
            </Tabs.Panel>
          </main>
        </Tabs.Wrapper>
      </div>
    </div>
  );
});

Settings.displayName = 'Settings';

export default Settings;
