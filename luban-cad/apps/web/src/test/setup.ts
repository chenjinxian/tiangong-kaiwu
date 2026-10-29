// 测试环境补形：jsdom 默认 navigator.language='en-US'，会把 i18n 默认语言
// 探测的 navigator 兜底分支推向 'en'，与产品主语言 zh-CN 不符，令 i18n
// 骨架测试的「默认 zh-CN」用例在 jsdom 下无法确定通过。此处钉住为 'zh-CN'
// （实例属性遮蔽 prototype getter）；个别测试需要其他语言时自行覆写。
Object.defineProperty(window.navigator, 'language', {
  value: 'zh-CN',
  configurable: true,
  enumerable: true,
});

// M1 Task 3：路由测试直挂 <MemoryRouter><Route/></MemoryRouter>（不经
// AppProviders 的 i18n 就绪门），此处全局 beforeAll 兜底初始化词库，
// 令 useTranslation 的 t() 在任意测试文件里都能取到词。
import { afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { initI18n } from '../common/i18n/index.js';

beforeAll(async () => {
  await initI18n();
});

// 同因（globals:false → RTL 自动 cleanup 不生效；既有测试文件各自显式挂钩）：
// brief 钉死的测试文件不含显式 cleanup，这里全局兜底，防前序 render 残留
// DOM 令 getBy* 命中多元素。双挂钩幂等无害。
afterEach(cleanup);

// M2 Task 5：jsdom 未实现 Element.scrollTo；iTwinUI Tabs 在 layout effect
// 里调用（share 对话框三页签），不补形即 TypeError（移植自旧应用
// apps/web test/setup.ts 同口径）。
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    value: () => {},
    writable: true,
  });
}

// 终审 M-d：原全局 afterEach(vi.resetAllMocks()) 已删——三份路由测试的
// beforeEach 已改块体（`() => { mock.mockReset(); }`），vitest 4「隐式
// return 注册 hook cleanup」陷阱（上游 vitest-dev/vitest#10845）不复存在，
// 全局清空失去存在理由；mock 生命周期归各测试文件自治。
