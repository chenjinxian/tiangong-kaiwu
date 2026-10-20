/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

/**
 * AuthBrandSide 共享品牌侧栏（RW4-P1-T1）：认证三页 brand 侧栏拷贝合一。
 * 断言：品牌名/标语走 i18n、默认四特性行、props 化特性行、空特性行隐藏。
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n/index.js';
import { AuthBrandSide } from './AuthBrandSide.js';

describe('AuthBrandSide', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('渲染品牌名与标语（i18n auth.brand.*）', () => {
    render(<AuthBrandSide />);
    expect(screen.getByText('鲁班CAD')).toBeDefined();
    expect(screen.getByText('基于 iTwin.js 的开源云端 CAD 平台')).toBeDefined();
  });

  it('默认渲染四条核心特性行', () => {
    render(<AuthBrandSide />);
    expect(screen.getByText('完全免费，开源透明')).toBeDefined();
    expect(screen.getByText('云端实时协作')).toBeDefined();
    expect(screen.getByText('工业级 3D 渲染引擎')).toBeDefined();
    expect(screen.getByText('专业 CAD 功能')).toBeDefined();
  });

  it('props 化特性行：传入自定义列表时按 props 渲染（Register 六行场景）', () => {
    render(
      <AuthBrandSide
        features={[
          { icon: 'A', label: '特性甲' },
          { icon: 'B', label: '特性乙' },
        ]}
      />,
    );
    expect(screen.getByText('特性甲')).toBeDefined();
    expect(screen.getByText('特性乙')).toBeDefined();
    // 默认特性行不再渲染
    expect(screen.queryByText('完全免费，开源透明')).toBeNull();
  });

  it('特性行为空数组时隐藏特性块（Register 成功态场景）', () => {
    const { container } = render(<AuthBrandSide features={[]} />);
    expect(container.querySelector('.auth-brand-features')).toBeNull();
    // 品牌名标语仍在
    expect(screen.getByText('鲁班CAD')).toBeDefined();
  });

  it('英文语言下品牌区渲染英文文案', async () => {
    await i18n.changeLanguage('en');
    render(<AuthBrandSide />);
    expect(screen.getByText('LubanCAD')).toBeDefined();
    await i18n.changeLanguage('zh-CN');
  });
});
