// docker-closure.cjs — 补齐 link: 依赖在容器内的运行时闭包。
//
// 背景：pnpm install 不会为 link: 目标安装其自身依赖（宿主靠 rush 各包自带
// node_modules 解析，容器内没有）。本脚本从本包 package.json 自动发现全部
// link: 依赖（含递归传递的 @itwin/*/@luban-cad/* 工作区包），分两个阶段工作：
//
//   --emit   走查依赖图，向 stdout 输出 registry 依赖的 pnpm add 清单
//            （在 pnpm install 之后、--link 之前执行；pnpm add 会重建 node_modules）
//   --link   对未被本包 link: 覆盖的 @itwin/*/@luban-cad/* 传递工作区依赖，
//            在 node_modules 内补 symlink 指向 staging 的 itwinjs-core/luban-cad 树
//
// Dockerfile 用法（WORKDIR = 本包目录）：
//   RUN node docker-closure.cjs --emit > /tmp/closure-add.txt \
//    && (test -s /tmp/closure-add.txt && xargs corepack pnpm@10 add \
//        --config.node-linker=hoisted < /tmp/closure-add.txt || true)
//   RUN node docker-closure.cjs --link
//
// 环境变量：
//   CLOSURE_REPO_ROOT  容器内 <Github> 等价根（默认 /build），其下应有
//                      tiangong-kaiwu/ 与 luban-backend/ 两棵 staging 树
const fs = require('fs');
const path = require('path');

const mode = process.argv[2];
if (mode !== '--emit' && mode !== '--link') {
  console.error('用法: node docker-closure.cjs --emit|--link');
  process.exit(1);
}

const repoRoot = process.env.CLOSURE_REPO_ROOT || '/build';
const pkgDir = process.cwd();
const nodeModules = path.join(pkgDir, 'node_modules');

// 相对 link: 目标 → 容器内绝对路径（相对锚点是 <Github> 根，即 repoRoot 的
// 一级子目录为仓名；本包在 <repoRoot>/luban-backend/<svc>/）
function resolveLinkTarget(spec) {
  // 宿主页：../../tiangong-kaiwu/itwinjs-core/core/backend
  // 容器页：pkgDir=/build/luban-backend/webhook-agent → ../../ = /build → 直接拼
  return path.resolve(pkgDir, spec.replace(/^link:/, ''));
}

// @itwin/* 工作区包名 → itwinjs-core 内目录（尝试多个候选根，适配两种 staging
// 布局：WA 的 /build/tiangong-kaiwu/itwinjs-core 与 web 的 /build/itwinjs-core）
function resolveWorkspacePkg(name) {
  const coreRoots = [
    path.join(repoRoot, 'tiangong-kaiwu/itwinjs-core'),
    path.join(repoRoot, 'itwinjs-core'),
  ];
  const cadRoots = [
    path.join(repoRoot, 'tiangong-kaiwu/luban-cad'),
    path.join(repoRoot, 'luban-cad'),
  ];
  const candidates = [];
  if (name.startsWith('@itwin/')) {
    const sub = name.replace('@itwin/', '');
    const known = {
      'core-backend': 'core/backend', 'core-bentley': 'core/bentley',
      'core-common': 'core/common', 'core-geometry': 'core/geometry',
      'core-quantity': 'core/quantity', 'ecschema-metadata': 'core/ecschema-metadata',
      'editor-backend': 'editor/backend', 'editor-common': 'editor/common',
      'editor-frontend': 'editor/frontend',
      'ecschema-rpcinterface-common': 'core/ecschema-rpc/common',
      'ecschema-rpcinterface-impl': 'core/ecschema-rpc/impl',
    };
    for (const root of coreRoots) {
      if (known[sub]) candidates.push(path.join(root, known[sub]));
      candidates.push(path.join(root, 'core', sub), path.join(root, 'editor', sub),
        path.join(root, 'presentation', sub), path.join(root, 'ui', sub));
    }
  } else if (name.startsWith('@luban-cad/')) {
    const sub = name.replace('@luban-cad/', '');
    for (const root of cadRoots) {
      candidates.push(path.join(root, 'packages', sub), path.join(root, 'modules', sub));
    }
  }
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'package.json'))) return p;
  }
  return null;
}

// 从本包 package.json 发现 link: 依赖（名字 → 容器内目标路径）
const rootPkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const linked = new Map();
for (const [dep, spec] of Object.entries({ ...rootPkg.dependencies, ...rootPkg.devDependencies })) {
  if (typeof spec === 'string' && spec.startsWith('link:')) {
    linked.set(dep, resolveLinkTarget(spec));
  }
}
if (linked.size === 0) { console.error('package.json 中未发现 link: 依赖'); process.exit(1); }

const addSet = new Set();   // registry 依赖（pnpm add 清单）
const linkMap = new Map();  // 待补 symlink 的工作区包（名字 → 目标路径）
const visited = new Set();

function walk(name, pkgJsonDir) {
  if (visited.has(name)) return;
  visited.add(name);
  const pkgJsonPath = path.join(pkgJsonDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) { console.error(`# 警告: ${name} 的 package.json 不存在于 ${pkgJsonDir}，跳过`); return; }
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const optionalPeers = new Set(
    Object.entries(pkg.peerDependenciesMeta || {}).filter(([, v]) => v && v.optional).map(([k]) => k)
  );
  const deps = { ...pkg.dependencies };
  for (const [k, v] of Object.entries(pkg.peerDependencies || {})) {
    if (!optionalPeers.has(k)) deps[k] = deps[k] || v;
  }
  for (const [dep, spec] of Object.entries(deps)) {
    if (dep.startsWith('@itwin/') || dep.startsWith('@luban-cad/')) {
      if (linked.has(dep)) {
        walk(dep, linked.get(dep)); // 已 link: 覆盖，递归其依赖
      } else if (fs.existsSync(path.join(nodeModules, dep))) {
        walk(dep, fs.realpathSync(path.join(nodeModules, dep))); // 已解析，递归
      } else {
        const target = resolveWorkspacePkg(dep);
        if (!target) { console.error(`# 警告: 工作区包 ${dep} 未在 itwinjs-core 找到，跳过`); continue; }
        linkMap.set(dep, target);
        walk(dep, target); // 递归新链接包的依赖（其 registry 依赖也要进 add 清单）
      }
    } else if (typeof spec === 'string' && /^(workspace|link|file):/.test(spec)) {
      continue; // 非 registry 规格，跳过
    } else {
      addSet.add(`${dep}@"${spec}"`);
    }
  }
}

for (const [name, target] of linked) walk(name, target);

if (mode === '--emit') {
  console.log([...addSet].join(' '));
} else {
  // --link：在 node_modules 补 symlink（pnpm add 之后执行，防被重建抹掉）
  for (const [dep, target] of linkMap) {
    const dest = path.join(nodeModules, dep);
    if (fs.existsSync(dest)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.symlinkSync(target, dest, 'dir');
    console.log(`# symlink: ${dep} -> ${target}`);
  }
}
