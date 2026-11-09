/**
 * 逐 body 质量属性读面（W1.5b 多 Part/body 展示，2026-11-08）。
 *
 * 零件段行按 bodyKey 展示体积（`MassPropertiesDto.volume`，真形内核质量属性）。
 * 只读 RPC `LubanFeatureRpcInterface.getMassProperties`；失败不阻塞树/特征操作，
 * 行内不显示体积（错误保留供诊断）。随 entries 引用（特征刷新）重跑——新特征
 * 落库后体积更新；连接缺失时不发请求。
 */
import * as React from 'react';
import type { BriefcaseConnection } from '@itwin/core-frontend';
import { LubanFeatureRpcInterface, type MassPropertiesDto } from '@luban-cad/shared';

export interface BodyMassPropertiesState {
  byBodyKey: ReadonlyMap<string, MassPropertiesDto>;
  loading: boolean;
  error?: string;
}

const EMPTY: BodyMassPropertiesState = { byBodyKey: new Map(), loading: false };

export function useBodyMassProperties(
  connection: BriefcaseConnection | undefined,
  partStudioId: string | undefined,
  refreshKey: unknown,
): BodyMassPropertiesState {
  const connectionKey = connection?.key;
  const [state, setState] = React.useState<BodyMassPropertiesState>(EMPTY);

  React.useEffect(() => {
    if (connectionKey === undefined) {
      setState(EMPTY);
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    try {
      const client = LubanFeatureRpcInterface.getClient();
      const scopeArgs: [] | [string] = partStudioId === undefined ? [] : [partStudioId];
      void client.getMassProperties(connectionKey, ...scopeArgs).then(
        (items) => {
          if (cancelled) return;
          setState({
            byBodyKey: new Map(items.map((item) => [item.bodyKey, item])),
            loading: false,
          });
        },
        (error: unknown) => {
          if (cancelled) return;
          setState({
            byBodyKey: new Map(),
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
    } catch (error) {
      setState({
        byBodyKey: new Map(),
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return () => {
      cancelled = true;
    };
  }, [connectionKey, partStudioId, refreshKey]);

  return state;
}
