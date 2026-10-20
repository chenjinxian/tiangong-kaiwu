/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * RW4-P5-T5-2a：VersionTimeline 英文化回归。
 * 使用真实 i18n 实例切换 en，钉住「编辑页版本时间线不残留中文」；
 * 结束后恢复 zh-CN（test/setup.ts 的全局口径）。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Changeset } from '@itwin/imodels-client-management';
import i18n, { LANGUAGE_STORAGE_KEY } from '../../../shared/i18n/index.js';
import { VersionTimeline } from './VersionTimeline.js';

vi.mock('./VersionTimeline.css', () => ({}));

function makeChangeset(over: Partial<Changeset> = {}): Changeset {
  return {
    id: 'cs-1',
    index: 1,
    pushDateTime: '2024-01-01T00:00:00Z',
    description: '',
    displayName: '',
    ...over,
  } as Changeset;
}

afterEach(async () => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, 'zh-CN');
  await i18n.changeLanguage('zh-CN');
});

describe('VersionTimeline i18n', () => {
  it('renders English copy in en locale', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    await i18n.changeLanguage('en');

    const { container } = render(
      <VersionTimeline
        isExpanded
        onToggleExpand={vi.fn()}
        changesets={[makeChangeset()]}
        currentChangesetId="cs-1"
        hasLocalChanges
        onPush={vi.fn()}
        onPull={vi.fn()}
        onShowHistory={vi.fn()}
        onShowVersions={vi.fn()}
      />,
    );

    expect(screen.getByText('1 changesets')).toBeDefined();
    expect(screen.getByText('Unpushed changes')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Push' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pull' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'History' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Versions' })).toBeDefined();
    expect(screen.getByText('(No description)')).toBeDefined();
    expect(screen.getByText('Current')).toBeDefined();
    expect(container.textContent).not.toMatch(new RegExp('[\\u4e00-\\u9fff]'));
  });
});
