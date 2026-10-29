/**
 * 构建期环境（Vite 静态注入；缺省值供本地栈直跑）。
 *
 * hubUrl 缺省=同源 origin（M3 收口 C1，终审 B1 定夺书方案 A）：dev 经 vite
 * 代理（vite.config.ts /auth /itwins /imodels… → :5400）、生产经 nginx 反代
 * （deploy/default.conf.template hub 九前缀）——浏览器到 hub 恒同源，官方
 * SDK 自带头（x-itwin-query-scope 等）不再触发跨域 preflight 被 hub CORS
 * 白名单拒（/documents 列表全挂的根因）。VITE_HUB_URL 仍可显式覆盖。
 */
function defaultHubUrl(): string {
  // SSR/非 DOM 守卫：web 为纯 SPA，仅防 Node 直跑（测试态 jsdom 有 window）。
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export const env = {
  msUrl: import.meta.env.VITE_MS_URL ?? 'http://localhost:5401',
  hubUrl: import.meta.env.VITE_HUB_URL ?? defaultHubUrl(),
} as const;
