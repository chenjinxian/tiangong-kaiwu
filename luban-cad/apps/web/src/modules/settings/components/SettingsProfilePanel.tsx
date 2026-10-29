/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * SettingsProfilePanel（M2 Task 7）：个人资料面板（对齐 Onshape os-48）——
 * 大头像 + 更改/移除钮 + 表单（名字/姓氏/用户名(论坛名)/昵称/个人简历）。
 * 头像更改/移除无后端承载（hub 无头像上传端点）——点击内联提示「即将推出」
 * （能力诚实，不静默 no-op）；表单为本地受控态，初始值取自会话姓名。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Flex, LabeledInput, Surface, Text } from '@itwin/itwinui-react';
import type { AuthUser } from '@clients/auth/AuthSession.js';

export interface SettingsProfilePanelProps {
  user: AuthUser | undefined;
}

/** 会话姓名拆 名字/姓氏（单名全量进名字；与旧应用 split 姿态一致）。 */
function splitName(name: string | undefined): { firstName: string; lastName: string } {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') };
}

export function SettingsProfilePanel({ user }: SettingsProfilePanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const initial = React.useMemo(() => splitName(user?.name), [user?.name]);

  const [firstName, setFirstName] = React.useState(initial.firstName);
  const [lastName, setLastName] = React.useState(initial.lastName);
  const [username, setUsername] = React.useState('');
  const [nickname, setNickname] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [avatarHint, setAvatarHint] = React.useState('');

  const abbreviation = (user?.name?.slice(0, 2) || user?.email?.slice(0, 2) || 'U').toUpperCase();

  return (
    <Surface className="settings-panel">
      <Flex flexDirection="column" gap="var(--iui-size-l)">
        <Text variant="title" as="h2" className="settings-panel__title">
          {t('settings.profile.title')}
        </Text>

        {/* 头像区：大头像 + 更改/移除（无后端承载——点击给能力提示） */}
        <Flex flexDirection="row" alignItems="center" gap="var(--iui-size-m)">
          <div data-testid="settings-profile-avatar">
            <Avatar
              size="x-large"
              title={user?.name || user?.email}
              abbreviation={abbreviation}
              image={user?.avatar ? <img src={user.avatar} alt="" /> : undefined}
            />
          </div>
          <Flex flexDirection="column" alignItems="flex-start" gap="var(--iui-size-2xs)">
            <Flex flexDirection="row" gap="var(--iui-size-xs)">
              <Button
                styleType="default"
                onClick={() => setAvatarHint(t('settings.profile.avatarHint'))}
              >
                {t('settings.profile.changeAvatar')}
              </Button>
              <Button
                styleType="default"
                onClick={() => setAvatarHint(t('settings.profile.avatarHint'))}
              >
                {t('settings.profile.removeAvatar')}
              </Button>
            </Flex>
            {avatarHint && (
              <Text variant="small" className="settings-profile__avatar-hint">
                {avatarHint}
              </Text>
            )}
          </Flex>
        </Flex>

        {/* 表单：名字/姓氏/用户名(论坛名)/昵称/个人简历 */}
        <Flex flexDirection="column" gap="var(--iui-size-m)" className="settings-profile__form">
          <LabeledInput
            label={t('settings.profile.firstName')}
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
          <LabeledInput
            label={t('settings.profile.lastName')}
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
          <LabeledInput
            label={t('settings.profile.username')}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <LabeledInput
            label={t('settings.profile.nickname')}
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
          <LabeledInput
            label={t('settings.profile.bio')}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
          />
        </Flex>
      </Flex>
    </Surface>
  );
}
