/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * useUndoRedo（web-next M4 Task 4）：撤销/重做/保存状态机——**BriefcaseTxns
 * 标准通道**（控制器裁定；禁止移植旧应用自造 UndoManager，apps/web/src/core/
 * undo/* 不引）：
 * - 状态口径：`connection.txns.isUndoPossible()/isRedoPossible()/hasPendingTxns()`
 *   三查询落位 canUndo/canRedo/hasUnsavedChanges（连接就绪引导 + 事件驱动重查）；
 * - 事件驱动：`onCommit`（提交前置 → 未存变更置真）/`onCommitted(hasPendingTxns)`
 *   （布尔直落 + 重查询）/`onAfterUndoRedo`（undo 清空撤销栈场景重查询）/
 *   `onChangesPushed`（推送清 pending 场景重查询）。P0 教训（saveChanges 循环：
 *   status 行写同值短路）——纯布尔态 + 事件驱动，无轮询无臆测口径；
 * - undo()/redo()：`IModelApp.tools.run('Undo'/'Redo')`（editor-frontend 内置
 *   UndoTool/RedoTool，viewer-next 注册表在册、快捷键已绑）——事务语义由 core
 *   管理，本 hook 只发标准工具；重入护栏防连点双跑；
 * - saveChanges()：代理 `connection.saveChanges(description)`（上游 5.9 标记
 *   deprecated，本仓编辑管道硬约束仍走 BriefcaseTxns/saveChanges——见
 *   viewer-next useBriefcaseConnection 同款注释），isSaving 驱动顶栏加载态；
 *   完成态由 onCommitted 事件回流（不在本 hook 手工翻转业务布尔）。
 *
 * 连接衍生布尔（canUndo/canRedo/hasUnsavedChanges/isSaving）为 hook 本地态：
 * spec §3 五分法——编辑会话态不入 store；连接运行时对象本体亦不进 store。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { LUBAN_INIT_TXN_DESCRIPTION } from '@luban-cad/shared';

/** 初始化事务不可撤销（撤销=删 BodySolid/schema=库损坏向量）；undo() 执行入口
 * 的同款守卫在 editor-frontend UndoTool（工具栏/快捷键/程序化单点封口）。 */
const INIT_TXN_DESCRIPTION = LUBAN_INIT_TXN_DESCRIPTION;

export interface UseUndoRedoResult {
  /** 撤销可用（BriefcaseTxns.isUndoPossible）。 */
  canUndo: boolean;
  /** 重做可用（BriefcaseTxns.isRedoPossible）。 */
  canRedo: boolean;
  /** 有未保存本地变更（hasPendingTxns 口径；事件驱动布尔）。 */
  hasUnsavedChanges: boolean;
  /** saveChanges 执行中（顶栏保存钮加载态）。 */
  isSaving: boolean;
  /** 撤销（标准工具 'Undo'；连接缺失 no-op）。 */
  undo: () => Promise<void>;
  /** 重做（标准工具 'Redo'；连接缺失 no-op）。 */
  redo: () => Promise<void>;
  /** 本地保存（connection.saveChanges 代理；连接缺失 no-op）。 */
  saveChanges: (description?: string) => Promise<void>;
}

export function useUndoRedo(connection: BriefcaseConnection | null): UseUndoRedoResult {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 连接/事务引用与查询序号（ref 持有：回调稳定 + 乱序响应丢弃）。
  const connectionRef = useRef<BriefcaseConnection | null>(null);
  const querySeqRef = useRef(0);
  const busyRef = useRef(false);

  // 重查询（三查询并发；乱序响应按序号丢弃；查询失败保态不抛——按钮态
  // 由下一次事件刷新）。
  const refresh = useCallback(async (): Promise<void> => {
    const conn = connectionRef.current;
    if (!conn) {
      querySeqRef.current += 1;
      setCanUndo(false);
      setCanRedo(false);
      setHasUnsavedChanges(false);
      return;
    }
    const seq = ++querySeqRef.current;
    try {
      const [undoPossible, redoPossible, pending, undoString] = await Promise.all([
        conn.txns.isUndoPossible(),
        conn.txns.isRedoPossible(),
        conn.txns.hasPendingTxns(),
        // M6-c 后置：初始化事务不可撤销（新鲜空树 undo 恒启用的产品级缺陷——
        // 待撤销事务=init 描述时 canUndo 翻假，执行入口由 UndoTool 同款守卫封口）。
        conn.txns.getUndoString().catch(() => undefined),
      ]);
      if (seq !== querySeqRef.current) return;
      setCanUndo(undoPossible && undoString !== INIT_TXN_DESCRIPTION);
      setCanRedo(redoPossible);
      setHasUnsavedChanges(pending);
    } catch {
      // 查询失败保态（连接将断等场景）；不臆测布尔。
    }
  }, []);

  // 连接挂载/更换：重置态 + 引导查询 + 挂标准事件。
  useEffect(() => {
    connectionRef.current = connection;
    querySeqRef.current += 1;
    if (!connection) {
      setCanUndo(false);
      setCanRedo(false);
      setHasUnsavedChanges(false);
      return;
    }

    const disposers: Array<() => void> = [];
    const { txns } = connection;
    disposers.push(txns.onCommit.addListener(() => setHasUnsavedChanges(true)));
    disposers.push(
      txns.onCommitted.addListener((hasPendingTxns) => {
        setHasUnsavedChanges(hasPendingTxns);
        void refresh();
      }),
    );
    disposers.push(txns.onAfterUndoRedo.addListener(() => void refresh()));
    disposers.push(txns.onChangesPushed.addListener(() => void refresh()));

    void refresh();

    return () => {
      for (const dispose of disposers) dispose();
      disposers.length = 0;
    };
  }, [connection, refresh]);

  const undo = useCallback(async (): Promise<void> => {
    if (!connectionRef.current || busyRef.current) return;
    busyRef.current = true;
    try {
      await IModelApp.tools.run('Undo');
    } finally {
      busyRef.current = false;
    }
  }, []);

  const redo = useCallback(async (): Promise<void> => {
    if (!connectionRef.current || busyRef.current) return;
    busyRef.current = true;
    try {
      await IModelApp.tools.run('Redo');
    } finally {
      busyRef.current = false;
    }
  }, []);

  const saveChanges = useCallback(async (description?: string): Promise<void> => {
    const conn = connectionRef.current;
    if (!conn) return;
    setIsSaving(true);
    try {
      // 上游 5.9 对 saveChanges 标记 deprecated（指向 EditCommand 方法）；本仓
      // 编辑管道硬约束事务仍走 BriefcaseTxns/saveChanges（luban-cad/CLAUDE.md
      // 铁律 1），保持 T1 连接层同款口径（web-next eslint 未启 no-deprecated
      // 规则，免 disable 指令）。
      await conn.saveChanges(description);
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { canUndo, canRedo, hasUnsavedChanges, isSaving, undo, redo, saveChanges };
}
