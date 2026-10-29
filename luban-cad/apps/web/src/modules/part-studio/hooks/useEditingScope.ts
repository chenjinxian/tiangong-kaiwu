/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useEditingScope（web M4 Task 4）：GraphicalEditingScope 进入/退出 hook——
 * 旧应用 `apps/web/src/pages/Editor/Editor.tsx:322-371` 忠实移植：
 * - 进入序：existingScope 复用（在场且未 dispose 则不重复 enter）→
 *   `supportsGraphicalEditing()` → `enterEditingScope()`；
 * - enter 失败回查：enterEditingScope 抛错时回查 `connection.editingScope`
 *   （后端竞态已建 scope 的场景），回查无果才向上抛；
 * - 失败口径（旧语义）：回查无果 → console.error 落日志后 isReady 仍放行
 *   （编辑面不因 scope 失败整体锁死；undo/redo/save 另有 txns 布尔门控）；
 * - 退出：卸载时 `scope.exit()` 吞错（Editor.tsx:312-319 同款 ref 退出）。
 *
 * 与旧实现的差异（诚实登记，勿静默）：
 *  - 新建 scope 也回写 scopeRef：旧代码只在「复用既有 scope」分支写 ref，
 *    首次新建的 scope 在无后续 effect 重跑时卸载不退出（泄漏）；此处两分支
 *    均回写，卸载退出语义完整（简报钉死的「卸载退出」意图）；
 *  - 旧 effect cleanup 的 `if (scope && !isEditable)` 分支因闭包捕获恒假
 *    （死代码——isEditable 翻 false 实际不退出 scope），本移植不携带该死
 *    分支：enabled=false 仅停止进入，退出仍只发生在卸载（旧实际行为）；
 *  - 异步续延补 cancelled 守卫：卸载后 enter 落定不回写状态/ref（防晚置
 *    ready 与悬空 ref）。
 */

import { useEffect, useRef, useState } from 'react';
import type { BriefcaseConnection, GraphicalEditingScope } from '@itwin/core-frontend';

export interface UseEditingScopeResult {
  /** 编辑作用域就绪（进入成功或失败放行——旧 Editor 口径）；未连接/未启用为 false。 */
  isReady: boolean;
}

export function useEditingScope(
  connection: BriefcaseConnection | undefined,
  enabled: boolean,
): UseEditingScopeResult {
  const [isReady, setIsReady] = useState(false);
  const scopeRef = useRef<GraphicalEditingScope | null>(null);

  useEffect(() => {
    if (!enabled || !connection) {
      return;
    }
    const conn = connection;
    let cancelled = false;
    let scope: GraphicalEditingScope | null = null;

    void (async () => {
      try {
        // 复用既有 scope（热重载/连接后已建场景）——不重复 enter。
        const existingScope = conn.editingScope;
        if (existingScope && !existingScope.isDisposed) {
          scope = existingScope;
          scopeRef.current = scope;
        }

        await conn.supportsGraphicalEditing();

        if (!scope) {
          try {
            scope = await conn.enterEditingScope();
          } catch (enterErr) {
            // enter 失败回查：后端可能已建 scope（竞态），在场即复用。
            const rechecked = conn.editingScope;
            if (rechecked && !rechecked.isDisposed) {
              scope = rechecked;
            } else {
              throw enterErr;
            }
          }
        }

        if (cancelled) return;
        scopeRef.current = scope;
        setIsReady(true);
      } catch (err) {
        // 旧口径：scope 进入失败不锁死编辑面——日志可见 + ready 放行。
        console.error('[useEditingScope] Failed to enter editing scope:', err);
        if (!cancelled) {
          setIsReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, connection]);

  // 卸载退出（Editor.tsx:312-319 忠实移植：exit 吞错 + ref 清零）。
  useEffect(() => {
    return () => {
      if (scopeRef.current) {
        void scopeRef.current.exit().catch(() => undefined);
        scopeRef.current = null;
      }
    };
  }, []);

  return { isReady };
}
