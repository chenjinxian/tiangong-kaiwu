/** 路由路径常量（终审 M-c）：与路由表（routes.tsx）同级独立成文件——
 * 路由组件回引本文件不会产生模块环（若在 routes.tsx 导出，则
 * routes.tsx ⇄ SignInRoute/SignUpRoute 互相引用）。 */
export const ROUTE_DOCUMENTS = '/documents';
