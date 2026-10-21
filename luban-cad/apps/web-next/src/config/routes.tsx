import type { RouteObject } from 'react-router-dom';
import { DevTokensRoute } from '@routes/DevTokensRoute.js';

/** 路由表（M0：仅令牌样张；后续里程碑按页追加）。 */
export const routes: RouteObject[] = [
  { path: '/', element: <DevTokensRoute /> },
];
