/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Language contract shared by viewer-core panels.
 *
 * viewer-core intentionally has NO i18next dependency. The host application
 * injects the current UI language through the optional `language` prop; the
 * default ('zh-CN') preserves the existing standalone behavior.
 */

export type ViewerLanguage = 'zh-CN' | 'en';

export interface ViewerLanguageProps {
  /**
   * 面板文案语言（RW4-P5：编辑器 en 象限不得残留中文）。
   * 默认 'zh-CN'；apps/web 经 i18n.language 判定后注入。
   */
  language?: ViewerLanguage;
}
