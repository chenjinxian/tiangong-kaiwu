/**
 * Copyright (c) LubanCAD. All rights reserved.
 *
 * useFeatureSystem（web M4 Task 5）：特征系统中枢 hook——旧应用
 * `apps/web/features/editor/hooks/useFeatureSystem.ts`（M3-a 权威源）**子集
 * 忠实移植**：特征树读取 + 写租约生命周期 + op 提交 + 事务后自动刷新。
 * 消费方：PartStudioSession 内层挂载（connection prop 所在层；T6 拉伸闭环
 * 的数据中枢——FeatureTree 真数据 + FeatureDialog 提交面）。
 *
 * 移植语义（与旧实现一致）：
 * - `enabled` 默认 `!!connection && !connection.isReadonly`，调用方可用
 *   `opts.enabled` 覆盖（editability 由调用者裁决，hook 只按裁决结果动作）；
 * - 写租约：enabled 时 acquire，10s 间隔 renew，unmount/失能 release。
 *   租约被拒 → `leaseOk:false`，UI 降级只读，但读树不被阻断；
 * - 读树用 `connection.key`；`connection.txns.onCommitted` **与
 *   `onAfterUndoRedo` 同订**触发 refresh（M5-T1 D-T9-6：反转事务不发
 *   onCommitted——M4 终审 MS 日志实证，undo/redo 后树不刷新；双订口径照
 *   官方 ModelChangeMonitor，vendored BriefcaseConnection.ts:124-128——
 *   onCommitted 与 onAfterUndoRedo 并列 addListener）；
 * - B6 M-A3.2a body 读面：每次 refresh 并行调 `getBodies(connection.key)`，与树
 *   同一刷新时机（onCommitted/onAfterUndoRedo/applyOp 成功/手动 refresh）——
 *   消费方（零件段/目标 body 选择器）不另开第二数据通道。两路错误隔离（body
 *   读面失败不拖住树）；`bodiesLoaded` 标记当前连接是否成功读到过读面（false=
 *   消费方回退 legacy 物理元素查询，仅 MS<1.15/读面故障时可达）。
 * - applyOp 租约自愈（2026-10-11）：前页/重载残留的陈旧租约要等服务端
 *   WriteLease 30s TTL 自然过期，而 op 是一次性派发——落在陈旧窗口内即被拒
 *   且无人重放。op 前显式重取（同 sessionId 幂等刷新 TTL），未得手则有限
 *   重试（2s 一跳、35s 预算封顶）直至陈旧租约自然过期；真实并发持有者
 *  （活页 10s renew 永不过期）在预算耗尽后照常拿到 holder 报错。
 *   成功后自动 refresh；失败仅返回错误结果不刷新；
 * - refresh 纪元守卫（M5-T1 T5-①）：慢响应晚到按序号丢弃——`refreshSeqRef`
 *   自增比对（照抄 useUndoRedo.ts:69,76 的 querySeqRef 模式），晚到的旧树
 *   不得覆盖新树/翻回 loading，过期请求的失败亦不得覆盖新态；
 * - 特征级超时兜底（M5-T1，清偿 T5 评审 Minor-4 挂账）：rpc-over-ipc 悬挂
 *   零反馈的根治——getFeatureTree / applyFeatureOp（op 路的 acquireWriteLease
 *   一并）套 `FEATURE_OP_TIMEOUT_MS`（15s，参照旧应用 RESOLVE_*_TIMEOUT_MS
 *   口径）Promise 超时竞速；超时 reject 经既有 error 通道呈现（树错误行/
 *   对话框就地 Alert），不再永久 busy。
 * - 只读写门禁（M5 发布窗，B2 插桩定位的前端根因）：`connection.isReadonly`
 *   时 applyOp **前置拒收**（i18n 只读错误，不发起 acquireWriteLease）——
 *   只读 briefcase（hub 权限缺陷致 E2E Seed 仅 webview → M5-T3 正确地 readonly
 *   开连接）下放行写 op 会卡进租约获取等待环（服务端租约表不校验 readonly，
 *   双会话互相持租约 → 35s 预算耗尽，aria-busy 40-65s）。UI 层门在
 *   FeatureDialog（宿主下传 canEdit，✓ 禁用）；此处是 hook 层防御纵深，
 *   防未来新调用点绕过 UI 门。
 * - 树/错误/租约布尔为 hook 本地 state（服务端态禁拷贝进 zustand——spec §3）。
 * - **B-model P2.4（P2.2 审查 Important）**：sessionId 与写租约生命周期不再由本
 *   hook 私有持有，改为消费 `useEditorSession` 的共享会话（`session.sessionId` /
 *   `session.iModelKey` / `session.leaseOk` / `session.acquire`）——与
 *   `usePartStudios`（注册表写方法）和默认 scope 的 pre-editor create 共用同一
 *   id + 同一库键；本 hook 自建第二会话会踩服务端租约竞争（单挂载铁律的延续）。
 * - **读面就绪门（P2.4）**：`opts.readEnabled=false` 时 refresh 不发任何 RPC
 *   （B 文档 scope 解析前不得先读 legacy 树）；解析完成置真后自动补读。
 *
 * **显式延后项（特征对话框增强 backlog，勿在本版补齐）**：
 * previewOp / resolveEdgeRef / resolveFaceRef / formModel——本版 extrude 走
 * `params: { profile: [], distance }` 直提交（shared opDsl 语义「空 profile=
 * 拉伸基体」）；拾取寻址与预览回 T6+ 特征对话框增强单裁。
 *
 * 与旧实现的差异（诚实登记，勿静默）：
 *  - 上列延后面（旧接口五成员不随迁）；
 *  - M5-T1 新增面（旧源没有）：onAfterUndoRedo 双订、refresh 纪元守卫、
 *    特征级超时兜底（均 web M4 冒烟暴露的呈现链缺口，终审给定案）；
 *  - i18n：旧源引 `shared/i18n` 的 editor ns；web 词桶挂默认 translation
 *    ns（`partStudio.featureSystem.*`，见 @common/i18n），经 i18next 单例直取
 *   （AppProviders 首帧 initI18n 门 + 测试 setup 兜底，回调内取词不吃闭包旧语）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import i18next from 'i18next';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import {
  type BodyInfo,
  type FeatureOp,
  type FeatureOpResult,
  type FeatureTreeEntry,
  LubanFeatureRpcInterface,
} from '@luban-cad/shared';
import type { DocumentMode } from '@modules/documents';
import { useWorkspaceRef } from '@common/workspace/use-workspace-ref.js';
import {
  LEASE_OP_ACQUIRE_BUDGET_MS,
  LEASE_OP_ACQUIRE_RETRY_MS,
  type EditorSession,
} from './useEditorSession.js';
import { FEATURE_OP_TIMEOUT_MS, withOpTimeout } from './feature-rpc.js';

// 超时常量/包装为 P2.4 抽出的共享件；此处转出保持既有测试与消费方的导入面。
export { FEATURE_OP_TIMEOUT_MS };

/** useFeatureSystem 选项（P2.4：session 共享 + 读面就绪门）。 */
export interface UseFeatureSystemOptions {
  /**
   * 读面就绪门（P2.4）：false 时不发任何读 RPC（B 文档 scope 解析前不得先读
   * legacy 树）并清空上一读面（F8：damaged/recovery 不得展示旧 scope 内容）；
   * 缺省 true（A 模式/既有调用语义）。
   */
  readEnabled?: boolean;
  /**
   * B/A 裁决（P2.4 F6）：'A' 时恒省略 scope 实参（忽略手工 URL `?model=`）；
   * 'B' 时携带 URL scope；undefined（旧调用/测试）保持“URL 有则携带”旧语义。
   */
  scopeMode?: DocumentMode;
}

export interface UseFeatureSystem {
  tree: FeatureTreeEntry[];
  loading: boolean;
  error?: string;
  /**
   * B6 M-A3.2a：body 读面（getBodies 直通；含 consumed 的 active=false）。
   * 与树同一 refresh 通道（onCommitted/onAfterUndoRedo/applyOp 成功/手动 refresh），
   * 消费方按 active/authored 过滤（树/目标选择器）。刷新失败保留上一次成功值。
   */
  bodies: BodyInfo[];
  bodiesLoading: boolean;
  /** 当前连接是否已成功读到过 body 读面（false=读面不可用，消费方回退 legacy 物理查询）。 */
  bodiesLoaded: boolean;
  bodiesError?: string;
  leaseOk: boolean;
  refresh(): Promise<void>;
  /** 成功后自动 refresh；失败仅返回错误结果不刷新 */
  applyOp(op: FeatureOp): Promise<FeatureOpResult>;
}

export function useFeatureSystem(
  connection: BriefcaseConnection | undefined,
  session: EditorSession,
  opts?: UseFeatureSystemOptions,
): UseFeatureSystem {
  // P2.4：sessionId/iModelKey/租约生命周期归 useEditorSession（共享单点）；
  // 本 hook 不再自建会话（双会话=双租约竞争）。
  const connectionKey = session.iModelKey;
  const sessionId = session.sessionId;
  const readEnabled = opts?.readEnabled ?? true;
  // B-model v1.17：活动 Part Studio id（文档路由 `?model=`）——读/写 RPC 的可选 scope。
  // 缺省（legacy 路由/A 模式）不传参数（保持旧调用 arity 与后端 legacy 服务键）。
  // P2.4 F6：scopeMode='A' 恒省略（A 文档手工 ?model= 不得进入 legacy 读/写）；
  // undefined 保持旧调用（测试/旧消费方）语义。
  const urlModelId = useWorkspaceRef()?.modelId;
  const partStudioId = opts?.scopeMode === 'A' ? undefined : urlModelId;

  const [tree, setTree] = useState<FeatureTreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  // 租约态归共享 session（P2.4；本 hook 不再自持租约）。
  const leaseOk = session.leaseOk;
  // B6 M-A3.2a：body 读面——与树同 refresh 通道；bodiesLoadedKey 记录成功读取的
  // 连接（换连接后须重新成功一次才视为读面可用，防旧库 body 列表串场）。
  const [bodies, setBodies] = useState<BodyInfo[]>([]);
  // 有连接且读面就绪时首帧即视为「读面进行中」：零件段先骨架、不抢跑 legacy
  // 全量查询（refresh effect 落定后转 false；读面不可用才回退 legacy）。
  // P2.4：读面未就绪（B scope 解析前）不置 loading——否则骨架永挂。
  const [bodiesLoading, setBodiesLoading] = useState<boolean>(!!connectionKey && readEnabled);
  const [bodiesError, setBodiesError] = useState<string | undefined>(undefined);
  const [bodiesLoadedKey, setBodiesLoadedKey] = useState<string | undefined>(undefined);
  const bodiesLoaded = !!connectionKey && bodiesLoadedKey === connectionKey;
  // refresh 纪元序号（M5-T1 T5-①）：慢响应晚到按序号丢弃——照抄
  // useUndoRedo.ts:69,76 的 querySeqRef 模式（ref 持有，乱序响应丢弃）。
  const refreshSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    // P2.4 读面就绪门：B 文档 scope 解析前不得发任何读 RPC（尤其 legacy 读面）；
    // 解析完成 readEnabled 翻真 → effect 补读。F8：失能即清空读面，damaged/
    // recovery 不展示上一 scope 的树/body/错误（bodiesLoaded 也必须归零）。
    if (!readEnabled) {
      setTree([]);
      setError(undefined);
      setLoading(false);
      setBodies([]);
      setBodiesError(undefined);
      setBodiesLoadedKey(undefined);
      setBodiesLoading(false);
      return;
    }
    if (!connectionKey) {
      setTree([]);
      setLoading(false);
      setError(undefined);
      setBodies([]);
      setBodiesLoading(false);
      setBodiesError(undefined);
      setBodiesLoadedKey(undefined);
      return;
    }
    const client = LubanFeatureRpcInterface.getClient();
    // 省略 vs 显式 undefined：旧调用方/测试按 arity 断言——无 scope 时不得多发实参。
    const scopeArgs: [] | [string] = partStudioId === undefined ? [] : [partStudioId];
    setLoading(true);
    setBodiesLoading(true);
    // 树与 body 读面并行、各自落定（bodies 失败不拖住树呈现；两路共用纪元守卫，
    // 晚到响应一律丢弃）。两路都 await，refresh 仍是「全部落定」语义（applyOp
    // 成功后的自动刷新因此不会只等树）。
    const treeCall = (async () => {
      try {
        const entries = await withOpTimeout(client.getFeatureTree(connectionKey, ...scopeArgs));
        if (seq !== refreshSeqRef.current) return; // 晚到响应按纪元丢弃（不得覆盖新树）
        setTree(entries);
        setError(undefined);
      } catch (err) {
        if (seq !== refreshSeqRef.current) return; // 过期请求的失败亦不得覆盖新态
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (seq === refreshSeqRef.current) setLoading(false); // 只有最新一跳有权收 loading
      }
    })();
    const bodiesCall = (async () => {
      try {
        const next = await withOpTimeout(client.getBodies(connectionKey, ...scopeArgs));
        if (seq !== refreshSeqRef.current) return;
        setBodies(next);
        setBodiesError(undefined);
        setBodiesLoadedKey(connectionKey);
      } catch (err) {
        if (seq !== refreshSeqRef.current) return;
        // 读面失败隔离于树错误（树/对话框不受阻）；保留上一次成功值供树渲染，
        // bodiesLoaded 语义由 bodiesLoadedKey 决定（初次失败=读面不可用）。
        setBodiesError(err instanceof Error ? err.message : String(err));
      } finally {
        if (seq === refreshSeqRef.current) setBodiesLoading(false);
      }
    })();
    await Promise.all([treeCall, bodiesCall]);
  }, [connectionKey, partStudioId, readEnabled]);

  // 初始/换连接加载特征树
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 外部 changeset / 其他编辑通道提交后刷新 + undo/redo 反转事务后刷新
  //（M5-T1 D-T9-6：反转事务不发 onCommitted——M4 终审 MS 日志实证；双订口径
  // 照官方 ModelChangeMonitor，vendored BriefcaseConnection.ts:124-128——
  // onCommitted 与 onAfterUndoRedo 并列 addListener）。
  useEffect(() => {
    if (!connection) return;
    const listener = () => {
      void refresh();
    };
    connection.txns.onCommitted.addListener(listener);
    connection.txns.onAfterUndoRedo.addListener(listener);
    return () => {
      connection.txns.onCommitted.removeListener(listener);
      connection.txns.onAfterUndoRedo.removeListener(listener);
    };
  }, [connection, refresh]);

  // 注：写租约生命周期（acquire → 10s renew → release）已上提 useEditorSession
  //（P2.4 共享会话）；本 hook 只消费 session.leaseOk / session.acquire。

  const applyOp = useCallback(async (op: FeatureOp): Promise<FeatureOpResult> => {
    if (!connectionKey) return { ok: false, error: i18next.t('partStudio.featureSystem.notConnected') };
    // 只读写门禁（B2 前端根因，hook 层防御纵深）：readonly 连接下写 op 前置
    // 拒收——不发起 acquireWriteLease（服务端租约表不校验 readonly，放行即卡
    // 35s 租约等待环）。FeatureDialog 的 canEdit 门是第一层，此门兜住绕过
    // UI 的新调用点。
    if (connection?.isReadonly) {
      return { ok: false, error: i18next.t('partStudio.featureSystem.readonlyConnection') };
    }
    const client = LubanFeatureRpcInterface.getClient();
    const scopeArgs: [] | [string] = partStudioId === undefined ? [] : [partStudioId];
    // 租约自愈（旧源同款纪律，见文件头注）：有限重试直至陈旧租约自然过期。
    // P2.4：acquire 归共享 session（同一 sessionId + iModelKey，与注册表写方法共用）。
    const lease = await session.acquire({
      budgetMs: LEASE_OP_ACQUIRE_BUDGET_MS,
      retryMs: LEASE_OP_ACQUIRE_RETRY_MS,
    });
    if (!lease.ok) {
      return {
        ok: false,
        error: lease.holder
          ? i18next.t('partStudio.featureSystem.leaseHeldBy', { holder: lease.holder })
          : i18next.t('partStudio.featureSystem.leaseAcquireFailed'),
      };
    }
    // 超时套接（M5-T1 超时兜底）：内核悬挂 → 15s 后以 i18n 超时错误 reject，
    // 经消费方（FeatureDialog 就地 Alert）既有错误面呈现。
    const result = await withOpTimeout(client.applyFeatureOp(connectionKey, op, sessionId, ...scopeArgs));
    if (result.ok) await refresh();
    return result;
  }, [connectionKey, connection, refresh, partStudioId, session, sessionId]);

  return {
    tree,
    loading,
    error,
    bodies,
    bodiesLoading,
    bodiesLoaded,
    bodiesError,
    leaseOk,
    refresh,
    applyOp,
  };
}
