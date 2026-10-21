// src/config/routes.tsx
//
// 路由表（M0：令牌样张 + 查看器冒烟；M1：登录/注册/找回密码页；M2 Task 1：
// 文档/settings 四路由挂 RequireAuth 占位——守卫接线先行，真实页面由后续
// M2 任务替换占位元素；受保护面：/documents、/documents/:iTwinId、
// /documents/:iTwinId/:iModelId、/settings）。

import type { RouteObject } from 'react-router-dom';
import { RequireAuth } from '@app/guards/RequireAuth.js';
import { DevTokensRoute } from '@routes/DevTokensRoute.js';
import { DevViewerRoute } from '@routes/DevViewerRoute.js';
import { ForgotPasswordRoute } from '@routes/ForgotPasswordRoute.js';
import { SignInRoute } from '@routes/SignInRoute.js';
import { SignUpRoute } from '@routes/SignUpRoute.js';

/** 受保护路由占位（M2 后续任务以真实页面替换）：有会话渲染空白锚点，
 * 无会话由 RequireAuth 拦跳 /login。 */
function ProtectedPlaceholder({ testId }: { testId: string }): React.JSX.Element {
  return <div data-testid={testId} />;
}

export const routes: RouteObject[] = [
  { path: '/', element: <DevTokensRoute /> },
  { path: '/dev-viewer', element: <DevViewerRoute /> },
  { path: '/login', element: <SignInRoute /> },
  { path: '/register', element: <SignUpRoute /> },
  { path: '/forgot-password', element: <ForgotPasswordRoute /> },
  {
    path: '/documents',
    element: <RequireAuth><ProtectedPlaceholder testId="documents-route" /></RequireAuth>,
  },
  {
    path: '/documents/:iTwinId',
    element: <RequireAuth><ProtectedPlaceholder testId="documents-itwin-route" /></RequireAuth>,
  },
  {
    path: '/documents/:iTwinId/:iModelId',
    element: <RequireAuth><ProtectedPlaceholder testId="documents-imodel-route" /></RequireAuth>,
  },
  {
    path: '/settings',
    element: <RequireAuth><ProtectedPlaceholder testId="settings-route" /></RequireAuth>,
  },
];
