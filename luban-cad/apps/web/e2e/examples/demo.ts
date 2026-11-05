/**
 * 通用示例演示辅助：字幕条 + 分步截图（与 Tutorial 2 showcase 同视觉口径）。
 * 字幕条是测试注入的 DOM，不是产品 UI；截图落到示例目录，供 index.html 串成演示。
 */
import type { Page } from '@playwright/test';

export async function demoCaption(page: Page, title: string, detail: string): Promise<void> {
  await page.evaluate(({ t, d }) => {
    let bar = document.getElementById('example-demo-caption');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'example-demo-caption';
      bar.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:28px', 'transform:translateX(-50%)',
        'z-index:2147483000', 'pointer-events:none', 'max-width:min(920px,92vw)',
        'padding:10px 18px', 'border-radius:10px',
        'background:rgba(16,27,46,.88)', 'color:#fff',
        'font:14px/1.5 "Segoe UI","Microsoft YaHei",system-ui,sans-serif',
        'box-shadow:0 8px 26px rgba(0,0,0,.25)', 'backdrop-filter:blur(6px)',
      ].join(';');
      document.body.appendChild(bar);
    }
    bar.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = t;
    strong.style.cssText = 'display:block;font-size:15px;margin-bottom:2px;color:#fff';
    const span = document.createElement('span');
    span.textContent = d;
    span.style.cssText = 'color:#c6d6ed;font-size:12.5px';
    bar.append(strong, span);
  }, { t: title, d: detail });
}

export interface DemoShotOptions {
  dir: string;
  index: number;
  slug: string;
  title: string;
  detail: string;
  holdMs?: number;
}

export async function demoShot(page: Page, options: DemoShotOptions): Promise<string> {
  const path = `${options.dir}/${String(options.index).padStart(3, '0')}-${options.slug}.png`;
  await demoCaption(page, options.title, options.detail);
  await page.waitForTimeout(options.holdMs ?? 500);
  await page.screenshot({ path });
  console.log(`[demo] ${String(options.index).padStart(3, '0')} ${options.title}`);
  return path;
}

export async function clearDemoCaption(page: Page): Promise<void> {
  await page.evaluate(() => document.getElementById('example-demo-caption')?.remove());
}
