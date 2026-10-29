// src/app/guards/RequireAuth.tsx
//
// M2 Task 1 前置三件套之一：路由守卫 RequireAuth。
// 无会话（getStoredAuth() 无 accessToken）→ <Navigate> 跳 /login，
// state 带 from（当前 location）供登录成功后回跳；有会话渲染 children。
// 不做过期裁决——过期清场/单飞刷新收敛在 AuthSession.getValidAccessToken
// （会话层模块头注的既定边界），守卫只看「有没有会话」。

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ROUTE_DOCUMENTS } from '@config/routes.constants.js';

/**
 * T1-③（M4-T8 收 M3 终审台账）形状守卫（纯函数）：from 须为 Location 形状
 * （pathname 为非空字符串）——下游 useAuthForm 回跳直接
 * `navigate(from.pathname)`，非形状值（缺 pathname/空串）会在回跳点落
 * navigate(undefined/'')；此处守卫兜底回退 ROUTE_DOCUMENTS。
 */
export function redirectLocationFrom(
  location: { pathname?: unknown } | undefined | null,
): { pathname: string } {
  const pathname = location?.pathname;
  return typeof pathname === 'string' && pathname !== '' ? { pathname } : { pathname: ROUTE_DOCUMENTS };
}

export function RequireAuth({ children }: { children: React.ReactNode }): React.JSX.Element {
  const location = useLocation();
  // redirect state 身份须跨渲染稳定：react-router <Navigate> 以 state 为
  // effect 依赖，而每次 navigate 都会生成新 location——若每渲染重建
  // { from: location }，该效应将无限重触发（state.from 逐层嵌套旧
  // location，实测 worker OOM）；生产路由结构下守卫跳转后即被 /login
  // 路由卸载本不触雷，但裸挂形态（测试/常驻布局）必须钉住。
  // T1-③：经形状守卫出值——from 恒为合法回跳形状。
  const redirectState = React.useMemo(() => ({ from: redirectLocationFrom(location) }), []);
  const stored = AuthSession.getStoredAuth();
  if (!stored?.accessToken) {
    return <Navigate to="/login" state={redirectState} replace />;
  }
  return <>{children}</>;
}
