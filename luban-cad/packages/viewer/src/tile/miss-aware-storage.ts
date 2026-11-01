/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * P2.8 残项：tile cache 冷 miss 的浏览器 404 console 噪声。
 *
 * iTwin.js 的 TileStorage.downloadTile 把「下载失败」一律视为 cache miss 并切到
 * 后端生成；但浏览器对真实 404 会无条件打印 `Failed to load resource`，无法从 JS
 * 抑制。部署侧（nginx/Vite）把 **tiles 路径** 的 Azurite 404 改写为 204 哨兵，
 * 本存储把 204（以及直连时的 404）转成 throw → TileStorage 返回 undefined →
 * 原生生成回退。这样既保留 miss/hit 覆盖，也不再产生 4xx console 噪声。
 *
 * 实现照抄 @itwin/core-frontend 内置 FetchCloudStorage（URL 构造/鉴权 query 同形），
 * 仅增加 miss 状态判定。stream 不用于 tile cache，保持显式拒绝。
 */

import type {
  FrontendConfigDownloadInput,
  FrontendConfigUploadInput,
  FrontendStorage,
  FrontendUploadInMultiplePartsInput,
  FrontendUrlDownloadInput,
  FrontendUrlUploadInput,
  ObjectReference,
} from '@itwin/object-storage-core/lib/frontend';

export class MissAwareFetchCloudStorage implements FrontendStorage {
  public download(
    input: (FrontendUrlDownloadInput | FrontendConfigDownloadInput) & { transferType: 'buffer' },
  ): Promise<ArrayBuffer>;
  public download(
    input: (FrontendUrlDownloadInput | FrontendConfigDownloadInput) & { transferType: 'stream' },
  ): Promise<ReadableStream>;
  public async download(
    input: FrontendUrlDownloadInput | FrontendConfigDownloadInput,
  ): Promise<ArrayBuffer | ReadableStream> {
    if (input.transferType === 'stream')
      throw new Error('tile cache stream download is not supported');
    if ('url' in input)
      return this.fetchBytes(input.url);
    const authentication = (input.transferConfig as { authentication?: unknown }).authentication;
    if (typeof authentication !== 'string')
      throw new Error('authentication missing/unsupported in transferConfig');
    const url = `${input.transferConfig.baseUrl}/${this.buildObjectKey(input.reference)}?${authentication}`;
    return this.fetchBytes(url);
  }

  public async upload(_input: FrontendUrlUploadInput | FrontendConfigUploadInput): Promise<void> {
    throw new Error('tile cache upload is not supported by the frontend');
  }

  public async uploadInMultipleParts(_input: FrontendUploadInMultiplePartsInput): Promise<void> {
    throw new Error('tile cache multipart upload is not supported by the frontend');
  }

  private async fetchBytes(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    // 204 = proxy miss sentinel; 404 = direct Azurite miss.
    if (response.status === 204 || response.status === 404)
      throw new Error('tile cache miss');
    if (!response.ok)
      throw new Error(`tile cache download failed: HTTP ${response.status}`);
    return response.arrayBuffer();
  }

  private buildObjectKey(reference: ObjectReference): string {
    const relative = reference.relativeDirectory ? `/${reference.relativeDirectory}` : '';
    return `${reference.baseDirectory}${relative}/${reference.objectName}`;
  }
}
