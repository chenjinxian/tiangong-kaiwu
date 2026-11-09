// Generate the local example gallery from demo manifests + runtime state.
//
// Usage (from repo root):
//   node luban-cad/scripts/onshape-parity/gallery.mjs
//
// The gallery is a generated local artifact (demo-artifacts/ is gitignored);
// it never becomes a product runtime source or a second model fact source.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const EXAMPLES = path.join(ROOT, 'apps', 'web', 'demo-artifacts', 'examples');
const OUT = path.join(EXAMPLES, 'index.html');

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
}

function walk(dir, depth = 0) {
  if (depth > 3) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) return [];
    if (entry.name.startsWith('_') || entry.name === 'node_modules') return [];
    return [full, ...walk(full, depth + 1)];
  });
}

const manifests = [];
for (const dir of [EXAMPLES, ...walk(EXAMPLES)]) {
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = readJson(manifestPath);
  if (manifest) manifests.push({ dir, rel: path.relative(EXAMPLES, dir), manifest });
}
const state = readJson(path.join(EXAMPLES, 'state.json'));

// manifest/state 一致性门（2026-11-08）：demo 目录名即 state document id。
// 旧 manifest 可能指向已重建/删除的 iModel（Sample/intro/iOS 均发生过）；
// 只比较双方都有 imodelId 的条目，缺失 state 的聚合型 manifest 不误报。
const stateById = new Map((state?.documents || []).map((doc) => [doc.id, doc]));
const manifestMismatches = manifests.flatMap((entry) => {
  const slug = entry.rel.split(path.sep)[0];
  const doc = stateById.get(slug);
  if (!doc?.imodelId || !entry.manifest.imodelId) return [];
  return doc.imodelId === entry.manifest.imodelId ? [] : [{
    manifest: entry.rel,
    manifestImodelId: entry.manifest.imodelId,
    stateImodelId: doc.imodelId,
  }];
});

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function screenshotsFor(entry) {
  const shots = entry.manifest.screenshots;
  if (Array.isArray(shots)) return shots;
  const files = readdirSync(entry.dir).filter((name) => /\.(png|webp|jpg|jpeg)$/i.test(name));
  return files.sort();
}

const cards = manifests
  .sort((a, b) => a.rel.localeCompare(b.rel))
  .map((entry) => {
    const m = entry.manifest;
    const expected = m.expected?.volumeMm3 ?? m.expected?.volumeCm3 ?? '—';
    const actual = m.actual?.volumeMm3 ?? m.actual?.volumeCm3 ?? '—';
    const shots = screenshotsFor(entry);
    const preview = shots[0] ? `<img loading="lazy" src="${esc(entry.rel)}/${esc(shots[0])}" alt=""/>` : '';
    const links = shots.slice(0, 4).map((shot) =>
      `<a href="${esc(entry.rel)}/${esc(shot)}" target="_blank">${esc(shot)}</a>`).join(' · ');
    return `<article class="card">
      ${preview}
      <div class="body">
        <h3>${esc(m.example || m.docName || entry.rel)}</h3>
        <p class="meta">${esc(m.owner || '')} · ${esc(m.imodelName || m.imodelId || '')}</p>
        <p>features: ${esc((m.featureTree || []).join(' → ') || '—')}</p>
        <p>body: ${esc(m.actual?.bodyCount ?? m.expected?.bodyCount ?? '—')} · volume: ${esc(actual)} / ${esc(expected)}</p>
        <p>runner: ${esc(m.runner || '—')} · verified: ${esc(m.verifiedAt || '—')}</p>
        <p class="links">${links}</p>
      </div>
    </article>`;
  }).join('\n');

const mismatchText = manifestMismatches.length === 0
  ? 'manifest/state iModelId mismatches: 0'
  : `manifest/state iModelId mismatches: ${manifestMismatches.length}（${manifestMismatches.map((m) => m.manifest).join(', ')}）`;

const stateRows = (state?.documents || []).map((doc) =>
  `<tr><td>${esc(doc.id)}</td><td>${esc(doc.projectId || '—')}</td><td>${esc(doc.imodelId || '—')}</td><td>${(doc.scopes || []).map((s) =>
    `${esc(s.name)}:${esc(s.status)}${s.volumeMm3 ? ` ${s.volumeMm3.toFixed(3)} mm³` : ''}`).join('<br/>')}</td></tr>`,
).join('\n');

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>LubanCAD · Onshape 示例复刻</title>
<style>
body{margin:0;background:#f6f8fb;color:#142033;font:14px/1.6 "Segoe UI","Microsoft YaHei",system-ui,sans-serif}
header{padding:36px 48px;background:#fff;border-bottom:1px solid #e3e8ef}
h1{margin:0 0 8px;font-size:30px}h2{margin:34px 48px 14px;font-size:20px}
p{color:#5b6b7f}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;padding:0 48px 48px}
.card{background:#fff;border:1px solid #e3e8ef;border-radius:10px;overflow:hidden;box-shadow:0 8px 24px rgba(20,32,51,.06)}
.card img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#eef2f7}
.body{padding:14px 16px 18px}.body h3{margin:0 0 4px;font-size:16px}.body p{margin:4px 0;font-size:12.5px}
.meta{color:#1651b0}.links a{color:#1651b0;margin-right:8px}
table{margin:0 48px 48px;border-collapse:collapse;background:#fff;border:1px solid #e3e8ef;width:calc(100% - 96px)}
th,td{padding:8px 10px;border-bottom:1px solid #eef2f7;text-align:left;font-size:12px;vertical-align:top}
code{font-size:12px}
</style></head><body>
<header><h1>LubanCAD · Onshape 示例复刻</h1>
<p>本页由 <code>scripts/onshape-parity/gallery.mjs</code> 生成；iModel/截图是本地演示产物，不是产品事实源。${esc(mismatchText)}。</p></header>
<h2>示例（${manifests.length}）</h2>
<section class="grid">${cards || '<p style="padding:0 48px">暂无 manifest；先运行示例 spec。</p>'}</section>
<h2>运行态 state（${state?.documents?.length || 0}）</h2>
<table><thead><tr><th>Document</th><th>Project</th><th>iModel</th><th>Scopes</th></tr></thead><tbody>${stateRows || '<tr><td colspan="4">暂无 state.json</td></tr>'}</tbody></table>
</body></html>`;
writeFileSync(OUT, html, 'utf8');
console.log(`wrote ${path.relative(ROOT, OUT)} (${manifests.length} manifests, ${state?.documents?.length || 0} state docs; ${mismatchText})`);
if (manifestMismatches.length > 0) {
  console.error(`manifest/state iModelId mismatch：${JSON.stringify(manifestMismatches, null, 2)}`);
  process.exitCode = 1;
}
