import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as IuiThemeProvider } from '@itwin/itwinui-react';
import { initI18n, isI18nReady } from '@common/i18n/index.js';
import { ThemeProvider, useTheme } from './ThemeContext.js';

// i18n 就绪门：模块加载即启动初始化。词库内联 → i18next.init 同步完成，
// 首帧 isI18nReady() 已为 true，children 不闪隐藏（也令既有同步渲染断言
// 的 App 测试保持原样通过）；useEffect 兜底，应对未来引入异步语言包后
// 首帧尚未就绪的场景——解析完成再渲染 children。
void initI18n();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** iTwinUI 主题桥（终审 C-B）：自研 ThemeContext 的 theme 联动给 iTwinUI
 * ThemeProvider（别名 IuiThemeProvider，导出同名冲突），使 data-iui-theme
 * 与 data-theme 同步——styles.css 的 iui 变量主题锚点自此生效（原 C1 关切：
 * 无 iui-root 时 iTwinUI 组件呈原生未样式化）。须挂在自研 ThemeProvider
 * 内层才能读到 theme 值。 */
function IuiThemeBridge({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { theme } = useTheme();
  return <IuiThemeProvider theme={theme}>{children}</IuiThemeProvider>;
}

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
      <ThemeProvider>
        {ready ? <IuiThemeBridge>{children}</IuiThemeBridge> : null}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
