/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 安装 Onshape 鼠标导航（右键旋转 / Ctrl+右键平移）：以 `OnshapeIdleTool`
 * 替换 `ToolAdmin.idleTool`，视图/选择工具不处理的分支（尤其 Reset 拖拽）
 * 仍会落到导航。卸载时恢复原 idleTool。
 *
 * `OnshapeIdleTool` 用动态 import：jsdom 单测常把 `@itwin/core-frontend`
 * 局部 mock（不含 IdleTool），模块级静态导入会让整批用例在收集期失败；
 * 这里仅在视口就绪（真实运行时）加载，失败则保持上游 idle tool。
 */
import React from 'react';
import { IModelApp } from '@itwin/core-frontend';
import type { InteractiveTool } from '@itwin/core-frontend';

export function useOnshapeMouseNavigation(ready: boolean): void {
  React.useEffect(() => {
    if (!ready)
      return;

    let disposed = false;
    let replacement: InteractiveTool | undefined;
    let previous: InteractiveTool | undefined;

    void (async () => {
      try {
        const { OnshapeIdleTool } = await import('../tools/modeling/OnshapeIdleTool.js');
        if (disposed)
          return;
        const admin = IModelApp.toolAdmin;
        if (!admin)
          return;
        try {
          previous = admin.idleTool;
        } catch {
          // 测试/未初始化环境：ToolAdmin._idleTool 尚未创建（getter assert）。
          previous = undefined;
        }
        replacement = new OnshapeIdleTool();
        admin.idleTool = replacement;
      } catch {
        // 局部 mock / 无 IdleTool：保持上游 idle tool（真栈由 e2e 覆盖）。
      }
    })();

    return () => {
      disposed = true;
      const admin = IModelApp.toolAdmin;
      if (admin && replacement && admin.idleTool === replacement && previous)
        admin.idleTool = previous;
    };
  }, [ready]);
}
