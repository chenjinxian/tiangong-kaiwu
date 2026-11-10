/**
 * examples 模块 barrel：路由层只经模块入口消费页面与 catalog 契约。
 */
export { ExamplesPage } from './ExamplesPage.js';
export {
  EXAMPLE_CATALOG,
  EXAMPLE_CATALOG_PROJECT_NAMES,
  EXAMPLE_OWNERS,
  formatExampleVolume,
} from './catalog.js';
export type { ExampleCatalogEntry, ExampleStrictness } from './catalog.js';
export { useExampleTargets } from './hooks/useExampleTargets.js';
export type { ExampleTarget, UseExampleTargetsResult } from './hooks/useExampleTargets.js';
