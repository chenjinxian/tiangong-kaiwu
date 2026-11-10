/**
 * 全部 Onshape 示例目录（public, 只读投影）。
 *
 * 数据来源：私有 `onshape-parity-data/manifest/example-index.json` 的 18 个
 * `replicable-now` 条目；本文件只保留公开可展示的聚合字段（owner/名称/目标
 * 体积/封面/精确 iModel 名）。不包含原始 features、坐标、elementId/docId、
 * 私有路径或 UI 证据——私有 index 仍是唯一事实源，更新时同步本投影并跑
 * catalogue 单测。
 *
 * `projectName + imodelName` 用于运行时按名解析真实 iModel；不硬编码 UUID。
 */

export type ExampleStrictness = 'strict' | 'strict-oracle';

export interface ExampleCatalogEntry {
  /** 稳定 slug（同私有 index 的 source 组合）。 */
  id: string;
  /** 展示标题（document / Part Studio 的可读组合）。 */
  title: string;
  owner: string;
  document: string;
  partStudio: string;
  /** 持久 iModel 所在项目；运行时只按名匹配，不写 UUID。 */
  projectName: string;
  /** 持久 iModel 名；与 e2e/示例库现状一致。 */
  imodelName: string;
  /** Onshape 目标体积（mm³，私有 index 的 expected totalVolumeMm3）。 */
  volumeMm3: number;
  /** 公共封面（真实栈截图）。 */
  cover: string;
  strictness: ExampleStrictness;
  note?: string;
}

export const EXAMPLE_CATALOG: readonly ExampleCatalogEntry[] = [
  {
    id: 'warning-label-bench-vise',
    title: 'Bench Vise / WARNING LABEL',
    owner: 'Explore Onshape Models',
    document: 'Bench Vise',
    partStudio: 'WARNING LABEL',
    projectName: 'Onshape 示例复刻',
    imodelName: 'WARNING LABEL - Bench Vise',
    volumeMm3: 0.8193532,
    cover: '/showcase/example-warning-label.webp',
    strictness: 'strict',
    note: 'WARNING LABEL 共享几何的文档变体',
  },
  {
    id: 'bumper-block',
    title: 'Dumper Trailer / Bumper Block',
    owner: 'Explore Onshape Models',
    document: 'Dumper Trailer',
    partStudio: 'Bumper Block',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Onshape example: Bumper Block (S10 faceExtrude + rb=3 oracle)',
    volumeMm3: 636731.4988494205,
    cover: '/showcase/example-bumper.webp',
    strictness: 'strict-oracle',
    note: '起始面拔模 + 圆角 16/16 · generic resolver 仍 12 边',
  },
  {
    id: 'alignment-plate',
    title: 'Sample Assignment / Alignment Plate',
    owner: 'Explore Onshape Models',
    document: 'Sample Assignment',
    partStudio: 'Alignment Plate',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Sample Assignment',
    volumeMm3: 8915.859905377773,
    cover: '/showcase/hero-sample-assignment.webp',
    strictness: 'strict',
  },
  {
    id: 'tutorial-2',
    title: 'Tutorial 2 - Build a Part',
    owner: 'Onshape',
    document: 'Tutorial 2 - Build a Part',
    partStudio: 'First Part',
    projectName: 'Tutorial 2 - Build a Part',
    imodelName: 'Tutorial 2 - Build a Part',
    volumeMm3: 357568.17668004945,
    cover: '/showcase/hero-tutorial2.webp',
    strictness: 'strict',
  },
  {
    id: 'tutorial-2-ios',
    title: 'Tutorial 2 - Build Your First Part - iOS',
    owner: 'Onshape',
    document: 'Tutorial 2 - Build Your First Part - iOS',
    partStudio: 'First Part',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Tutorial 2 - Build Your First Part - iOS',
    volumeMm3: 157478.90183482267,
    cover: '/showcase/example-ios.webp',
    strictness: 'strict',
  },
  {
    id: 'warning-label-edu-quickstart',
    title: 'Onshape EDU Quickstart / WARNING LABEL',
    owner: 'Onshape Training',
    document: 'Onshape EDU Quickstart',
    partStudio: 'WARNING LABEL',
    projectName: 'Onshape 示例复刻',
    imodelName: 'WARNING LABEL - Onshape EDU Quickstart',
    volumeMm3: 0.8193532,
    cover: '/showcase/example-warning-label.webp',
    strictness: 'strict',
    note: 'WARNING LABEL 共享几何的文档变体',
  },
  {
    id: 'warning-label-professional-discovery',
    title: 'Onshape Professional Discovery Quickstart / WARNING LABEL',
    owner: 'Onshape Training',
    document: 'Onshape Professional Discovery Quickstart',
    partStudio: 'WARNING LABEL',
    projectName: 'Onshape 示例复刻',
    imodelName: 'WARNING LABEL - Onshape Professional Discovery Quickstart',
    volumeMm3: 0.8193532,
    cover: '/showcase/example-warning-label.webp',
    strictness: 'strict',
    note: 'WARNING LABEL 共享几何的文档变体',
  },
  {
    id: 'warning-label-quickstart',
    title: 'Onshape Quickstart / WARNING LABEL',
    owner: 'Onshape Training',
    document: 'Onshape Quickstart',
    partStudio: 'WARNING LABEL',
    projectName: 'Onshape 示例复刻',
    imodelName: 'WARNING LABEL - Onshape Quickstart',
    volumeMm3: 0.8193532,
    cover: '/showcase/example-warning-label.webp',
    strictness: 'strict',
    note: 'WARNING LABEL 共享几何的文档变体',
  },
  {
    id: 'eng-bearing',
    title: 'DRILL HOTD / ENG_BEARING',
    owner: 'Onshape Training Repo',
    document: 'DRILL HOTD - INITIAL',
    partStudio: 'ENG_BEARING',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Onshape example: DRILL HOTD / ENG_BEARING',
    volumeMm3: 2590.2431428847817,
    cover: '/showcase/example-eng-bearing.webp',
    strictness: 'strict',
  },
  {
    id: 'basic-drawing-wheel',
    title: 'Exercise: Basic Drawing / Wheel',
    owner: 'Onshape Training Repo',
    document: 'Exercise: Basic Drawing',
    partStudio: 'Wheel',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Exercise - Basic Drawing',
    volumeMm3: 2442293.7638547923,
    cover: '/showcase/example-basic-drawing.webp',
    strictness: 'strict',
  },
  {
    id: 'element-organization-o-ring',
    title: 'Exercise: Element Organization / O-Ring',
    owner: 'Onshape Training Repo',
    document: 'Exercise: Element Organization',
    partStudio: 'O-Ring',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Onshape example: Element Organization / O-Ring',
    volumeMm3: 454.92707786271274,
    cover: '/showcase/example-o-ring.webp',
    strictness: 'strict',
  },
  {
    id: 'element-organization-bushing',
    title: 'Exercise: Element Organization / Bushing',
    owner: 'Onshape Training Repo',
    document: 'Exercise: Element Organization',
    partStudio: 'Bushing',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Onshape example: Element Organization / Bushing',
    volumeMm3: 3259.6851214382345,
    cover: '/showcase/example-bushing.webp',
    strictness: 'strict',
  },
  {
    id: 'hand-brake-master-cylinder',
    title: 'Exercise: Hand Brake Update / Master Cylinder Piston',
    owner: 'Onshape Training Repo',
    document: 'Exercise: Hand Brake Update',
    partStudio: 'Master Cylinder Piston',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Exercise - Hand Brake Update',
    volumeMm3: 7125.27416082794,
    cover: '/showcase/example-handbrake.webp',
    strictness: 'strict',
  },
  {
    id: 'drive-sleeve-intermediate',
    title: 'Exercise: Intermediate Drawing / Drive Sleeve',
    owner: 'Onshape Training Repo',
    document: 'Exercise: Intermediate Drawing',
    partStudio: 'Drive Sleeve',
    projectName: 'Onshape 示例复刻',
    imodelName: 'E2E - Drive Sleeve Scenario',
    volumeMm3: 1175024.3076979537,
    cover: '/showcase/example-drive-sleeve.webp',
    strictness: 'strict',
  },
  {
    id: 'drive-sleeve-update',
    title: 'Exercise: Update Drawing / Drive Sleeve',
    owner: 'Onshape Training Repo',
    document: 'Exercise: Update Drawing',
    partStudio: 'Drive Sleeve',
    projectName: 'Onshape 示例复刻',
    imodelName: 'E2E - Drive Sleeve Scenario (Update Drawing)',
    volumeMm3: 1175024.3076979532,
    cover: '/showcase/example-drive-sleeve.webp',
    strictness: 'strict',
  },
  {
    id: 'intro-part-1',
    title: 'Intro to CAD 1.2 / Part 1',
    owner: 'Onshape Training Repo',
    document: 'Intro to CAD - 1.2 - Viewing Objects in Onshape',
    partStudio: 'Part 1',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Onshape example: Intro to CAD 1.2 Part 1',
    volumeMm3: 409676.6,
    cover: '/showcase/example-intro-part1.webp',
    strictness: 'strict',
  },
  {
    id: 'intro-part-2',
    title: 'Intro to CAD 1.2 / Part 2',
    owner: 'Onshape Training Repo',
    document: 'Intro to CAD - 1.2 - Viewing Objects in Onshape',
    partStudio: 'Part 2',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Onshape example: Intro to CAD 1.2 Part 2',
    volumeMm3: 294967.15199999994,
    cover: '/showcase/example-intro-part2.webp',
    strictness: 'strict',
  },
  {
    id: 'intro-part-3',
    title: 'Intro to CAD 1.2 / Part 3',
    owner: 'Onshape Training Repo',
    document: 'Intro to CAD - 1.2 - Viewing Objects in Onshape',
    partStudio: 'Part 3',
    projectName: 'Onshape 示例复刻',
    imodelName: 'Onshape example: Intro to CAD 1.2 Part 3',
    volumeMm3: 229418.896,
    cover: '/showcase/example-intro-part3.webp',
    strictness: 'strict',
  },
];

export const EXAMPLE_OWNERS: readonly string[] = Array.from(
  new Set(EXAMPLE_CATALOG.map((entry) => entry.owner)),
);

export const EXAMPLE_CATALOG_PROJECT_NAMES: readonly string[] = Array.from(
  new Set(EXAMPLE_CATALOG.map((entry) => entry.projectName)),
);

/** 目标体积的只读展示（mm³；极小的 WARNING LABEL 保留 3 位小数）。 */
export function formatExampleVolume(volumeMm3: number): string {
  if (!Number.isFinite(volumeMm3)) return '—';
  if (volumeMm3 < 1) return `${volumeMm3.toFixed(3)} mm³`;
  return `${volumeMm3.toLocaleString('en-US', { maximumFractionDigits: 3 })} mm³`;
}
