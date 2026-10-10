#!/usr/bin/env node
// replace-imodeljs-native-postinstall.cjs
// itwinjs-core rush.json eventHooks.postRushInstall 的守卫包装（tiangong-kaiwu fork 本地接线）：
//   - 非 Windows 平台优雅 no-op（Linux 容器/宿主刻意停留官方 npm 包，spec §4.4 裁决）；
//   - Windows 下转交 replace-imodeljs-native.ps1（cwd 由 rush 保证为 itwinjs-core/，
//     本包装以 __dirname 定位 ps1，不受 cwd 影响）。
// 失败语义：rush EventHooksManager 对非零退出只打黄色警告、不阻断 rush update/install，
// 故此处如实透传退出码（宿主进程锁 DLL、产物缺失等 "fail loud" 场景仍可见）。
// 手动兜底：powershell -File scripts/replace-imodeljs-native.ps1
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (process.platform !== 'win32') {
  console.log('[postInstall] replace-imodeljs-native: 非 Windows 平台，跳过（Linux 容器/宿主按裁决使用官方 npm 包）');
  process.exit(0);
}

const ps1 = path.resolve(__dirname, 'replace-imodeljs-native.ps1');
const result = spawnSync(
  'powershell',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
  { stdio: 'inherit' }
);
if (result.error) {
  console.error(`[postInstall] replace-imodeljs-native 启动失败: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
