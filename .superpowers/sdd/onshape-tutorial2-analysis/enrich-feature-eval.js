// v3 富化采集器：仅为现有 replay-cases 对应的 Part Studio 采集 sidecar。
// - 每草图 qSketchRegion → deterministicId + areaM2
// - 每特征 rollbackBarIndex → evVolume(qEverything)
// 全程只读，不创建副本、不改 Onshape 文档；原始 corpus/docs 不改写。
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('D:/Github/tiangong-kaiwu/luban-cad/node_modules/.pnpm/ws@8.21.3/node_modules/ws');
const { parseFeatureScriptResponse, buildSketchRegionLambda, buildVolumeLambda } = require('./feature-eval-lib.js');

const ROOT = __dirname;
const DOCS_DIR = path.join(ROOT, 'corpus', 'docs');
const CASES_DIR = path.join(ROOT, 'replay-cases');
const OUT_DIR = path.join(ROOT, 'corpus', 'feature-eval');
const DONE_FILE = path.join(ROOT, 'corpus', 'feature-eval-done.json');
const LOAD_WAIT = 22000;
const EVAL_DELAY = 600;
fs.mkdirSync(OUT_DIR, { recursive: true });

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('getJson timeout: ' + url)));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function slugOf(s, id) { return (s || 'unnamed').replace(/[^\w一-龥-]+/g, '-').slice(0, 40) + '-' + String(id).slice(-6); }

/** 现有回放用例反查原始文档/PS（不靠名称猜测：与转换器同 slug 规则）。 */
function collectTargets() {
  const wanted = new Set(fs.readdirSync(CASES_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')));
  const targets = [];
  for (const f of fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(DOCS_DIR, f), 'utf8'));
    if (d.status !== 'ok' || !d.partStudios) continue;
    for (const ps of d.partStudios) {
      const id = slugOf(d.name, ps.elementId);
      if (!wanted.has(id)) continue;
      const feats = (ps.features && ps.features.features) || [];
      targets.push({ id, docId: d.id, elementId: ps.elementId, doc: d.name, ps: ps.name, features: feats });
    }
  }
  return targets.sort((a, b) => a.id.localeCompare(b.id));
}

(async () => {
  const targets = collectTargets();
  if (!targets.length) throw new Error('replay-cases 未匹配到任何原始 Part Studio');
  const done = new Set(fs.existsSync(DONE_FILE) ? JSON.parse(fs.readFileSync(DONE_FILE, 'utf8')) : []);
  console.log(`目标 ${targets.length} 个 PS；已完成 ${done.size}`);

  const pages = await getJson('http://localhost:9222/json/list');
  const pg = pages.find(p => p.type === 'page' && p.url.includes('cad.onshape.com'));
  if (!pg) throw new Error('未找到 Onshape 页签');
  const version = await getJson('http://localhost:9222/json/version');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, resolve);
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP timeout: ' + method)); } }, 180000);
  });
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });

  ws.on('open', async () => {
    const { sessionId } = await send('Target.attachToTarget', { targetId: pg.id, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    const evalJs = (expression) => send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)
      .then(x => x && x.result ? x.result.value : undefined)
      .catch(() => undefined);

    let currentDocId = null;
    let workspaceId = null;
    const failures = [];

    async function ensureDocument(docId) {
      if (currentDocId === docId && workspaceId) return;
      await send('Page.navigate', { url: `https://cad.onshape.com/documents/${docId}` }, sessionId);
      await sleep(LOAD_WAIT);
      const ready = await evalJs(`({title:document.title,signedOut:document.body.innerText.includes('Sign in')})`);
      if (!ready || ready.signedOut || /sign in/i.test(ready.title)) throw new Error('Onshape 会话失效，请重新登录');
      const info = await evalJs(`(async()=>{const accept='application/json;charset=UTF-8; qs=0.09';
        const r=await fetch('/api/v14/documents/${docId}',{credentials:'include',headers:{accept}});
        const d=await r.json();
        return {http:r.status,wid:(d.defaultWorkspace&&d.defaultWorkspace.id)||(d.workspaces&&d.workspaces[0]&&d.workspaces[0].id),message:d.message||null};})()`);
      if (!info || info.http !== 200 || !info.wid) throw new Error(`文档工作区获取失败: ${JSON.stringify(info)}`);
      currentDocId = docId;
      workspaceId = info.wid;
    }

    async function evalFeatureScript(target, script, rollback) {
      const expr = `(async()=>{try{
        const accept='application/json;charset=UTF-8; qs=0.09';
        const xsrf=(document.cookie.match(/(?:^|;\\s*)XSRF-TOKEN=([^;]+)/)||[])[1];
        const headers={accept,'content-type':'application/json;charset=UTF-8; qs=0.09'};
        if(xsrf) headers['X-XSRF-TOKEN']=decodeURIComponent(xsrf);
        const r=await fetch('/api/v14/partstudios/d/${target.docId}/w/${workspaceId}/e/${target.elementId}/featurescript?rollbackBarIndex=${rollback}',{
          method:'POST',credentials:'include',headers,body:${JSON.stringify(JSON.stringify({ script }))}});
        const text=await r.text();
        return {http:r.status,text};
      }catch(e){return {http:0,text:String(e)}}})()`;
      const response = await evalJs(expr);
      if (!response || response.http !== 200) throw new Error(`FeatureScript HTTP ${response ? response.http : 'undefined'} @${target.id} rollback=${rollback}: ${response ? response.text.slice(0, 240) : 'no response'}`);
      const parsed = parseFeatureScriptResponse(response.text);
      await sleep(EVAL_DELAY);
      return parsed;
    }

    for (const target of targets) {
      if (done.has(target.id)) { console.log(`跳过已完成 ${target.id}`); continue; }
      try {
        await ensureDocument(target.docId);
        console.log(`采集 ${target.id}（${target.features.length} 特征）`);
        const sketches = {};
        for (const ft of target.features.filter(f => f.featureType === 'newSketch')) {
          const response = await evalFeatureScript(target, buildSketchRegionLambda(ft.featureId), -1);
          if (!Array.isArray(response.result)) throw new Error(`面域响应非数组: ${ft.featureId}`);
          sketches[ft.featureId] = { regions: response.result };
        }
        const volumeTimeline = [];
        let sourceMicroversion;
        let libraryVersion;
        for (let i = 0; i < target.features.length; i++) {
          const ft = target.features[i];
          const response = await evalFeatureScript(target, buildVolumeLambda(), i + 1);
          if (typeof response.result !== 'number' || !Number.isFinite(response.result)) throw new Error(`体积响应非数值: rollback=${i + 1}`);
          sourceMicroversion = response.sourceMicroversion || sourceMicroversion;
          libraryVersion = response.libraryVersion || libraryVersion;
          volumeTimeline.push({ rollback: i + 1, featureId: ft.featureId, featureType: ft.featureType, volumeM3: response.result });
        }
        const sidecar = {
          id: target.id, docId: target.docId, elementId: target.elementId,
          sourceMicroversion, libraryVersion, sketches, volumeTimeline,
          collectedAt: new Date().toISOString(),
        };
        fs.writeFileSync(path.join(OUT_DIR, target.id + '.json'), JSON.stringify(sidecar, null, 1));
        done.add(target.id);
        fs.writeFileSync(DONE_FILE, JSON.stringify([...done].sort(), null, 1));
        console.log(`  ok：${Object.keys(sketches).length} 草图、${volumeTimeline.length} 个体积点`);
      } catch (e) {
        failures.push({ id: target.id, error: String(e).slice(0, 300) });
        console.error(`  失败 ${target.id}: ${failures[failures.length - 1].error}`);
        currentDocId = null; workspaceId = null; // 下个目标强制重建会话上下文
      }
    }

    console.log('=== 富化采集完成 ===', `成功 ${done.size}/${targets.length}`, `失败 ${failures.length}`);
    if (failures.length) console.log(JSON.stringify(failures, null, 1));
    ws.close();
    process.exit(failures.length ? 1 : 0);
  });
  ws.on('error', (e) => { console.error('CDP:', e.message); process.exit(1); });
  setTimeout(() => { console.error('总超时'); process.exit(1); }, 3600000);
})().catch(e => { console.error(e); process.exit(1); });
