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
    // 2026-11-10：Intro Part 4 已由分量质心证据转严格绿；Part 1–4 卡片必须由
    // 真实截图守护。Bumper/Fox 等未公开示例不得用已知红充数。
    expect(screen.getByText('Intro to CAD 1.2 / Part 1–4')).toBeDefined();
    expect(screen.getByText('409,676.600 / 294,967.152 / 229,418.896 / 262,193.024 mm³')).toBeDefined();
    expect(document.querySelector('img[src="/showcase/example-intro-part4.webp"]')).not.toBeNull();
    expect(screen.queryByText('Bumper Block')).toBeNull();
    expect(screen.queryByText('Fox RP23')).toBeNull();
    // hero/CTA 计数与 2026-11-10 发布闭口一致（strict 19；目录页为独立入口）。
    const heroFacts = Array.from(document.querySelectorAll('.showcase-hero__facts li'))
      .map((item) => item.textContent);
    expect(heroFacts).toContain('19 个严格验证示例');
    expect(screen.getByText('打开应用，或在全部示例目录查看 19 个示例的封面、目标体积与打开入口。')).toBeDefined();
    expect(screen.getByRole('link', { name: '浏览全部示例' }).getAttribute('href')).toBe('/examples');
    expect(screen.getByText('Tutorial 2 - Build a Part')).toBeDefined();
    expect(screen.getByText('真形（TrueForm）')).toBeDefined();
    expect(screen.getByRole('link', { name: '进入鲁班CAD' }).getAttribute('href')).toBe('/login');
  });
});
