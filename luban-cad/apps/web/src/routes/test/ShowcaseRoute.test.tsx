// ShowcaseRoute（2026-11-06）结构验收：公开产品介绍页必须承载
// 4K 截图、1080p 视频与真实能力/示例文案，且不依赖登录态。
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ShowcaseRoute } from '../ShowcaseRoute.js';

describe('ShowcaseRoute 产品介绍页', () => {
  it('渲染 4K 实景图、1080p 视频与能力/示例区块', () => {
    render(
      <MemoryRouter>
        <ShowcaseRoute />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('BRep');
    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute('src')).toBe('/showcase/tutorial2-demo-1080p.webm');
    expect(video.getAttribute('poster')).toBe('/showcase/hero-tutorial2.webp');
    expect(document.querySelectorAll('img[src^="/showcase/"]').length).toBeGreaterThanOrEqual(10);
    expect(screen.getByText('Tutorial 2 - Build a Part')).toBeDefined();
    expect(screen.getByText('真形（TrueForm）')).toBeDefined();
    expect(screen.getByRole('link', { name: '进入鲁班CAD' }).getAttribute('href')).toBe('/login');
  });
});
