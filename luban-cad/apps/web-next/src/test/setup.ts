// 测试环境补形：jsdom 默认 navigator.language='en-US'，会把 i18n 默认语言
// 探测的 navigator 兜底分支推向 'en'，与产品主语言 zh-CN 不符，令 i18n
// 骨架测试的「默认 zh-CN」用例在 jsdom 下无法确定通过。此处钉住为 'zh-CN'
// （实例属性遮蔽 prototype getter）；个别测试需要其他语言时自行覆写。
Object.defineProperty(window.navigator, 'language', {
  value: 'zh-CN',
  configurable: true,
  enumerable: true,
});
