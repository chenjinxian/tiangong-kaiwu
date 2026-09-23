/*---------------------------------------------------------------------------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { OpenCloudRpcInterface } from '@open-cloud-cad/shared';
import type { ElementGeometryResultOptions, ElementGeometryResultProps } from '@itwin/editor-common';

/**
 * 执行编辑命令的通用生命周期管理
 * 处理 RPC 客户端获取、命令启动/完成、错误处理和状态管理
 */
export async function executeEditCommand(
  iModelKey: string,
  method: string,
  elementId: string,
  buildProps: (rpc: ReturnType<typeof OpenCloudRpcInterface.getClient> & {}) => Promise<unknown>,
  opts: ElementGeometryResultOptions,
  setState: (updater: (prev: { isProcessing: boolean; error: string | null; lastResult: ElementGeometryResultProps | undefined }) => { isProcessing: boolean; error: string | null; lastResult: ElementGeometryResultProps | undefined }) => void,
): Promise<ElementGeometryResultProps | undefined> {
  setState((prev) => ({ ...prev, isProcessing: true, error: null }));

  try {
    const rpc = OpenCloudRpcInterface.getClient();
    if (!rpc) {
      throw new Error('OpenCloudRpc not available');
    }

    const props = await buildProps(rpc);

    await rpc.startEditCommand('solidModeling', iModelKey);

    let result: ElementGeometryResultProps | undefined;
    try {
      result = await rpc.callEditMethod(method, elementId, props, opts) as ElementGeometryResultProps | undefined;
    } finally {
      try {
        await rpc.finishEditCommand();
      } catch {
        // Ignore finish error — preserve the original callEditMethod error
      }
    }

    setState((prev) => ({ ...prev, lastResult: result, isProcessing: false }));
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    setState((prev) => ({ ...prev, error: errorMsg, isProcessing: false }));
    try {
      const rpc = OpenCloudRpcInterface.getClient();
      if (rpc) {
        await rpc.finishEditCommand();
      }
    } catch {
      // Ignore finish error during cleanup
    }
    return undefined;
  }
}
