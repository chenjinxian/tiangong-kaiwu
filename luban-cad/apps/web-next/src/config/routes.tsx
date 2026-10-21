// src/config/routes.tsx
//
// 路由表（M0：令牌样张 + 查看器冒烟；M1：登录/注册/找回密码页；M2 Task 1：
// 文档/settings 四路由挂 RequireAuth 占位——守卫接线先行；M2 Task 5：
// /documents 占位换 DocumentsRoute 真实页；M2 Task 6：/documents/:iTwinId
// 占位换 DocumentDetailsRoute 真实页；M2 Task 7：/settings 占位换
// SettingsRoute 真实页；M3 Task 3：/documents/:iTwinId/:iModelId 占位换
// PartStudioRoute 真实页（编辑器布局壳）；受保护面：/documents、
// /documents/:iTwinId、/documents/:iTwinId/:iModelId、/settings）。

import type { RouteObject } from 'react-router-dom';
import { RequireAuth } from '@app/guards/RequireAuth.js';
import { DevTokensRoute } from '@routes/DevTokensRoute.js';
import { DevViewerRoute } from '@routes/DevViewerRoute.js';
import { DocumentDetailsRoute } from '@routes/DocumentDetailsRoute.js';
import { DocumentsRoute } from '@routes/DocumentsRoute.js';
import { ForgotPasswordRoute } from '@routes/ForgotPasswordRoute.js';
import { PartStudioRoute } from '@routes/PartStudioRoute.js';
import { SettingsRoute } from '@routes/SettingsRoute.js';
import { SignInRoute } from '@routes/SignInRoute.js';
import { SignUpRoute } from '@routes/SignUpRoute.js';

export const routes: RouteObject[] = [
  { path: '/', element: <DevTokensRoute /> },
  { path: '/dev-viewer', element: <DevViewerRoute /> },
  { path: '/login', element: <SignInRoute /> },
  { path: '/register', element: <SignUpRoute /> },
  { path: '/forgot-password', element: <ForgotPasswordRoute /> },
  {
    path: '/documents',
    element: <RequireAuth><DocumentsRoute /></RequireAuth>,
  },
  {
    path: '/documents/:iTwinId',
    element: <RequireAuth><DocumentDetailsRoute /></RequireAuth>,
  },
  {
    path: '/documents/:iTwinId/:iModelId',
    element: <RequireAuth><PartStudioRoute /></RequireAuth>,
  },
  {
    path: '/settings',
    element: <RequireAuth><SettingsRoute /></RequireAuth>,
  },
];
