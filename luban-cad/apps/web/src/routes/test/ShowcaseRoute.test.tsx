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
    expect(video.getAttribute('poster')).toBe('/showcase/video-poster.webp');
    expect(document.querySelectorAll('img[src^="/showcase/"]').length).toBeGreaterThanOrEqual(10);
    // 2026-11-09 收口：Intro Part 1–3 卡片必须由真实截图守护；blocked 示例
    // （Part 4 / Bumper / Fox）不得出现在公开示例区，避免用已知红充数。
    expect(screen.getByText('Intro to CAD 1.2 / Part 1–3')).toBeDefined();
    expect(screen.getByText('409,676.600 / 294,967.152 / 229,418.896 mm³')).toBeDefined();
    expect(document.querySelector('img[src="/showcase/example-intro-part3.webp"]')).not.toBeNull();
    expect(screen.queryByText('Bumper Block')).toBeNull();
    expect(screen.queryByText('Fox RP23')).toBeNull();
    expect(screen.queryByText(/Part 4/)).toBeNull();
    // hero/CTA 计数与 2026-11-10 发布闭口一致（strict 18；目录页为独立入口）。
    const heroFacts = Array.from(document.querySelectorAll('.showcase-hero__facts li'))
      .map((item) => item.textContent);
    expect(heroFacts).toContain('18 个严格验证示例');
    expect(screen.getByText('打开应用，或在全部示例目录查看 18 个示例的封面、目标体积与打开入口。')).toBeDefined();
    expect(screen.getByRole('link', { name: '浏览全部示例' }).getAttribute('href')).toBe('/examples');
    expect(screen.getByText('Tutorial 2 - Build a Part')).toBeDefined();
    expect(screen.getByText('真形（TrueForm）')).toBeDefined();
    expect(screen.getByRole('link', { name: '进入鲁班CAD' }).getAttribute('href')).toBe('/login');
  });
});
