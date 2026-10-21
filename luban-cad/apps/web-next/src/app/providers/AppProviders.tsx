import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { initI18n, isI18nReady } from '@common/i18n/index.js';
import { ThemeProvider } from './ThemeContext.js';

// i18n 就绪门：模块加载即启动初始化。词库内联 → i18next.init 同步完成，
// 首帧 isI18nReady() 已为 true，children 不闪隐藏（也令既有同步渲染断言
// 的 App 测试保持原样通过）；useEffect 兜底，应对未来引入异步语言包后
// 首帧尚未就绪的场景——解析完成再渲染 children。
void initI18n();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function AppProviders({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [ready, setReady] = React.useState(isI18nReady);

  React.useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void initI18n().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{ready ? children : null}</ThemeProvider>
    </QueryClientProvider>
  );
}
