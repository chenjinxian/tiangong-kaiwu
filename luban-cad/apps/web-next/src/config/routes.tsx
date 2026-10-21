import type { RouteObject } from 'react-router-dom';
import { DevTokensRoute } from '@routes/DevTokensRoute.js';
import { DevViewerRoute } from '@routes/DevViewerRoute.js';

/** 路由表（M0：令牌样张 + 查看器冒烟；后续里程碑按页追加）。 */
export const routes: RouteObject[] = [
  { path: '/', element: <DevTokensRoute /> },
  { path: '/dev-viewer', element: <DevViewerRoute /> },
];
