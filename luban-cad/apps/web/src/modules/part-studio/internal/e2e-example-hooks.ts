/**
 * E2E 示例选择器观测面（仅 `VITE_E2E_HOOKS=true`；发布镜像不安装）。
 *
 * 目的：scenario replay 需要把 Onshape 的 CAP_EDGE / SWEPT_EDGE 语义映射为
 * 产品既有的持久边引用（resolveEdgeRef），但浏览器端没有「列出 body 边」的
 * 产品 RPC。这里把与 BRep 显示同一通道的只读边枚举暴露给 Playwright，
 * 匹配与 resolveEdgeRef 调用仍在 e2e 侧完成——不新增建模 API、不写数据。
 */
import type { BodyInfo } from '@luban-cad/shared';
import type { BrepEdgeHandle, BrepFaceHandle } from './brep-topology.js';

export interface ExampleE2EHook {
  readEdgeHandles(
    iModelKey: string,
    bodies: readonly BodyInfo[],
  ): Promise<BrepEdgeHandle[] | undefined>;
  /** faceExtrude/面选择器：面边界环 + 范围 + 法线（dev-only 只读拓扑观测面）。 */
  readFaceHandles(
    iModelKey: string,
    bodies: readonly BodyInfo[],
  ): Promise<BrepFaceHandle[] | undefined>;
}

declare global {
  interface Window {
    // e2e 观测面契约名（window.__lubanE2EExamples）。
    __lubanE2EExamples?: ExampleE2EHook;
  }
}

/** 安装示例观测面（幂等；构建期 env 未开启时不生效）。`forceEnabled` 仅单测使用。 */
export function installExampleE2EHooks(forceEnabled?: boolean): void {
  if (typeof window === 'undefined') return;
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const enabled = forceEnabled ?? env?.VITE_E2E_HOOKS === 'true';
  if (!enabled) return;
  if (window.__lubanE2EExamples) return;
  window.__lubanE2EExamples = Object.freeze({
    // 动态 import：发布构建不把只读拓扑通道打进首屏入口。
    async readEdgeHandles(iModelKey: string, bodies: readonly BodyInfo[]) {
      const [{ readBrepEdgeHandles }, { withExclusiveBrepCommand }] = await Promise.all([
        import('./brep-topology.js'),
        import('./brep-command-coordinator.js'),
      ]);
      // 与显示拓扑读面/hover 串行：共享 SolidModeling 命令槽与粘性几何缓存。
      return withExclusiveBrepCommand(() => readBrepEdgeHandles(iModelKey, bodies));
    },
    async readFaceHandles(iModelKey: string, bodies: readonly BodyInfo[]) {
      const [{ readBrepFaceHandles }, { withExclusiveBrepCommand }] = await Promise.all([
        import('./brep-topology.js'),
        import('./brep-command-coordinator.js'),
      ]);
      return withExclusiveBrepCommand(() => readBrepFaceHandles(iModelKey, bodies));
    },
  });
}
