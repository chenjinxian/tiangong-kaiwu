/**
 * Copyright (c) LubanCAD. All rights reserved. Licensed under the MIT License.
 *
 * 移植工具的双语提示词表（M4 Task 3，2026-10-22 随 editor 模块收编迁入）。
 *
 * 包边界裁决：旧应用工具文案走 app 级 i18next（旧 apps/web 的 shared/i18n，
 * editor ns，`i18n.t('modelingTools.*', { ns: 'editor' })`）；本包是 app 无关的
 * link: 包，不能反向依赖 app 的 i18n 单例——故在包内自带最小词表（键名与旧
 * editor.json 逐键一致，迁移零改写），插值用同款 `{{param}}` 语法。语言取
 * `@luban-cad/web` 的持久化键 `luban-next-lang`（缺省 zh-CN；host 可用
 * setToolMessagesLanguage 显式钉死）。全量回归 app 级 i18n 时只需把本模块
 * 换成 resolver 注入（backlog，勿静默遗忘）。
 *
 * 2026-10-22 随 editor 模块收编迁入本包（@itwin/editor-frontend）src/luban/
 * modeling/（原 packages/viewer 的 tools/messages.ts，消费方仅同批随迁的建模工具）。
 */

/** 词表语言（与 @luban-cad/web AppLanguage 同域：zh-CN | en）。 */
export type ToolMessagesLanguage = 'zh-CN' | 'en';

/** 单条词目（`{{param}}` 插值；与 i18next 默认插值语法一致）。 */
type Catalog = Record<string, string>;

const ZH_CN: Catalog = {
  // —— 打孔（CreateHoleTool）——
  'modelingTools.holePrompt': '点击选择打孔位置，或在面上选择具体位置',
  'modelingTools.holePositionSelected': '已选择位置 ({{x}}, {{y}}, {{z}})，右键完成或继续点击选择新位置',
  'modelingTools.holeApplying': '正在打孔: 直径 {{diameter}}mm, 深度 {{depth}}mm...',
  'modelingTools.holeDone': '打孔完成: 直径 {{diameter}}mm, 深度 {{depth}}mm',
  'modelingTools.holeFailed': '打孔失败: {{message}}',
  // —— 镜像（MirrorElementsTool）——
  'modelingTools.mirrorSelect': '选择要镜像的元素（已选 {{count}} 个），右键进入下一步',
  'modelingTools.mirrorPlanePoint': '点击选择镜像平面上的点',
  'modelingTools.mirrorPlaneNormal': '点击确定镜像平面法向，或右键使用默认法向（Y轴）',
  'modelingTools.mirrorApplying': '正在镜像 {{count}} 个元素...',
  'modelingTools.mirrorDone': '镜像完成: {{count}} 个元素已镜像',
  'modelingTools.mirrorFailed': '镜像失败: {{message}}',
  // —— 拔模（DraftFacesTool）——
  'modelingTools.draftPrompt': '点击选择要拔模的面（角度: {{angle}}°），右键完成选择',
  'modelingTools.draftSelected': '已选择 {{count}} 个面，右键完成选择',
  'modelingTools.draftApplying': '正在执行拔模: {{count}} 个面, 角度 {{angle}}°...',
  'modelingTools.draftDone': '拔模完成: {{count}} 个面已应用 {{angle}}° 拔模角度',
  'modelingTools.draftFailed': '拔模失败: {{message}}',
  // —— 阵列工具设置（PatternTools）——
  'modeling.pattern.toolCount': '数量',
  'modeling.pattern.toolSpacing': '间距',
  'modeling.pattern.toolTotalAngle': '总角度',
};

const EN: Catalog = {
  'modelingTools.holePrompt': 'Click to choose the hole position, or pick a specific location on a face',
  'modelingTools.holePositionSelected': 'Position selected ({{x}}, {{y}}, {{z}}). Right-click to finish or keep clicking to choose a new position',
  'modelingTools.holeApplying': 'Creating hole: diameter {{diameter}}mm, depth {{depth}}mm...',
  'modelingTools.holeDone': 'Hole created: diameter {{diameter}}mm, depth {{depth}}mm',
  'modelingTools.holeFailed': 'Failed to create hole: {{message}}',
  'modelingTools.mirrorSelect': 'Select elements to mirror ({{count}} selected); right-click to continue',
  'modelingTools.mirrorPlanePoint': 'Click to choose a point on the mirror plane',
  'modelingTools.mirrorPlaneNormal': 'Click to set the mirror plane normal, or right-click to use the default normal (Y axis)',
  'modelingTools.mirrorApplying': 'Mirroring {{count}} elements...',
  'modelingTools.mirrorDone': 'Mirror complete: {{count}} elements mirrored',
  'modelingTools.mirrorFailed': 'Mirror failed: {{message}}',
  'modelingTools.draftPrompt': 'Click faces to draft (angle: {{angle}}°); right-click when done',
  'modelingTools.draftSelected': '{{count}} faces selected; right-click when done',
  'modelingTools.draftApplying': 'Applying draft to {{count}} faces at {{angle}}°...',
  'modelingTools.draftDone': 'Draft complete: {{count}} faces drafted at {{angle}}°',
  'modelingTools.draftFailed': 'Draft failed: {{message}}',
  'modeling.pattern.toolCount': 'Count',
  'modeling.pattern.toolSpacing': 'Spacing',
  'modeling.pattern.toolTotalAngle': 'Total angle',
};

const CATALOGS: Record<ToolMessagesLanguage, Catalog> = { 'zh-CN': ZH_CN, en: EN };

/** 语言持久化键（apps/web 的 src/common/i18n 同源；包内只读不写）。 */
const LANGUAGE_STORAGE_KEY = 'luban-next-lang';

let override: ToolMessagesLanguage | undefined;

/** 显式钉语言（host / 测试用；未调用时按 localStorage 探测）。 */
export function setToolMessagesLanguage(lang: ToolMessagesLanguage): void {
  override = lang;
}

function detectLanguage(): ToolMessagesLanguage {
  if (override) return override;
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

/** `{{param}}` 插值（缺失/非标量参数保留原样，便于漏词暴露）。 */
function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const value = params[name];
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint' && typeof value !== 'boolean') return match;
    return String(value);
  });
}

/**
 * 取移植工具的提示词（键名同旧应用 editor.json；缺词回退另一语言、再退键名——
 * 与 i18next fallback 语义同向，缺词可见而非静默空白）。
 */
export function toolMessage(key: string, params?: Record<string, unknown>): string {
  const lang = detectLanguage();
  const template = CATALOGS[lang][key] ?? (lang === 'zh-CN' ? EN[key] : ZH_CN[key]) ?? key;
  return interpolate(template, params);
}
