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

// vitest 4 陷阱兜底（实测 4.1.11，上游 vitest-dev/vitest#10845）：测试文件
// 若写 `beforeEach(() => mock.mockReset())`——箭头隐式 return 的是 mock 函数
// 本身，vitest 4 会把 hook 返回的函数注册为 cleanup，用例结束时 vitest 会
// 调用该 mock（无参）——此时若实现是 mockRejectedValue 注入的拒绝，这个
// 「用户已捕获」的拒绝会被当作用例错误上报（判为用例失败）。在 afterEach
// 阶段先清空全部 mock 实现（本仓各用例均在用例体内自行桩实现，清空无副作用），
// 使上述隐式 cleanup 调用拿到 undefined 而非拒绝。afterEach 先于 hook
// 注册的 cleanup 执行（4.1.11 实测），顺序敏感，勿调换到 onFinished 之后。
import { vi } from 'vitest';
afterEach(() => {
  vi.resetAllMocks();
});
