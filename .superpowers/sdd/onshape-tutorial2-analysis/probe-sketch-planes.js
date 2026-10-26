// 只读探针（SoF-T2）：对派生平面草图与基准面求 evPlane，提取权威平面帧（Onshape 世界系，米）。
// 派生平面在其**自身特征回滚点**求值（rollbackBarIndex=该草图前已应用特征数），避免面被
// 后续特征吞掉。写 corpus/sketch-planes/<caseId>.json；不改任何文档。
//
// 【2026-10-26 实测坑（重要）】
// 1. 新会话的 XSRF-TOKEN 不再暴露在 document.cookie——必须从 CDP Network.getCookies
//    取值，显式带 X-XSRF-TOKEN 头，否则 featurescript POST 恒 401。
// 2. featurescript POST 有严格反滥用窗口：一次 ~14 连发触发 429 + retry-after≈8.6h
//    （GET 端点不受影响）。故本探针：POST 间 3s 节流、任一 429 立即中止（保部分结果）、
//    每回滚点只发 1 次（owner 只试 makeId("")）。
// 3. FeatureScript 的 map 不支持 out[key]=value 赋值（求值失败 result=null 烧配额）——
//    一律返回数组（append），调用方再拼对象。
const fs = require('fs');
const path = require('path');
const WebSocket = require('D:/Github/tiangong-kaiwu/luban-cad/node_modules/.pnpm/ws@8.21.3/node_modules/ws');
const http = require('http');
const { parseFeatureScriptResponse } = require('./feature-eval-lib.js');
const { decodeQCompressed } = require('./qcompressed-lib.js');

const get = (u) => new Promise((resolve, reject) => {
  const req = http.get(u, (res) => { let x = ''; res.on('data', (c) => x += c); res.on('end', () => { try { resolve(JSON.parse(x)); } catch (e) { reject(e); } }); });
  req.on('error', reject);
  req.setTimeout(10000, () => req.destroy(new Error('timeout')));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOAD_WAIT = 22000;
const POST_DELAY = 3000;

// 派生平面草图 → 其回滚点（该草图前已应用特征数；与 volume timeline 同口径）。
// Calculate 先行（1 POST 验证 lambda 形态，烧配额最小）。
const TARGETS = [
  { caseId: 'Calculate-Bounds', docId: '2ce3e64026df1ac7e63b98bd', elementId: 'ee8919ad0a28cec3b0740617', derived: { FD7taJv3Rm1tCTV_3: 7 } },
  {
    caseId: 'Isomantle', docId: '3599036701247d65f0106997', elementId: 'af3be680979824ee83a0620b',
    derived: {
      FWuO3B6xrPJdkWH_3: 8, FWOoybNAQ0IWesr_3: 10, FUWSsAhFQqeUaQJ_3: 12,
      FkDb3bS0zdlttBn_3: 15, FX9ZjHIcdOalIpE_4: 18, FFILGabLClDhnB2_4: 20,
    },
  },
];

/** 数组化 lambda 主体：res = [[fid, origin, normal, x], ...]（FS append；无 map 赋值）。 */
function planeArrayBody(items) {
  return items.map((i) => `  var p_${i.fid.replace(/[^A-Za-z0-9_]/g, '')} = evPlane(context, { "plane": qCompressed(1.0, "${i.payload}", makeId("")) });
  res = append(res, ["${i.fid}", p_${i.fid.replace(/[^A-Za-z0-9_]/g, '')}.origin / meter, p_${i.fid.replace(/[^A-Za-z0-9_]/g, '')}.normal / meter, p_${i.fid.replace(/[^A-Za-z0-9_]/g, '')}.x / meter]);`).join('\n');
}

(async () => {
  const [pages, v] = await Promise.all([get('http://localhost:9222/json/list'), get('http://localhost:9222/json/version')]);
  const pg = pages.find((p) => p.type === 'page' && p.url.includes('cad.onshape.com'));
  if (!pg) throw new Error('调试浏览器无 Onshape 页');
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  let msgId = 0; const pend = new Map();
  const send = (m, p = {}, s) => new Promise((resolve, reject) => {
    const i = ++msgId; pend.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method: m, params: p, ...(s ? { sessionId: s } : {}) }));
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); reject(new Error('CDP timeout ' + m)); } }, 120000);
  });
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
  ws.on('error', (e) => { console.error('CDP:', e.message); process.exit(1); });

  ws.on('open', async () => {
    let rateBlocked = false;
    try {
      const { sessionId } = await send('Target.attachToTarget', { targetId: pg.id, flatten: true });
      await send('Runtime.enable', {}, sessionId);
      await send('Page.enable', {}, sessionId);
      await send('Network.enable', {}, sessionId);
      const evalJs = (e) => send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }, sessionId)
        .then((x) => x && x.result ? x.result.value : undefined);

      async function xsrfToken() {
        const gc = await send('Network.getCookies', { urls: ['https://cad.onshape.com'] }, sessionId);
        const hit = (gc.cookies || []).find((c) => c.name === 'XSRF-TOKEN');
        return hit ? hit.value : '';
      }

      /** 单次 featurescript 求值；429 置 rateBlocked 并抛出（外层中止）。 */
      async function evalFeatureScript(docId, elementId, wid, script, rollback) {
        const token = await xsrfToken();
        const expr = `(async()=>{try{
          const accept='application/json;charset=UTF-8; qs=0.09';
          const headers={accept,'content-type':'application/json;charset=UTF-8; qs=0.09','X-XSRF-TOKEN':'${token}'};
          const r=await fetch('/api/v14/partstudios/d/${docId}/w/${wid}/e/${elementId}/featurescript?rollbackBarIndex=${rollback}',{
            method:'POST',credentials:'include',headers,body:${JSON.stringify(JSON.stringify({ script }))}});
          const text=await r.text();
          return {http:r.status,text};
        }catch(e){return {http:0,text:String(e)}}})()`;
        const response = await evalJs(expr);
        if (response && response.http === 429) {
          rateBlocked = true;
          throw new Error(`429 限流（featurescript 反滥用窗口；中止保部分结果）: ${String(response.text).slice(0, 120)}`);
        }
        if (!response || response.http !== 200) throw new Error(`FeatureScript HTTP ${response?.http} rollback=${rollback}: ${String(response?.text).slice(0, 240)}`);
        const parsed = parseFeatureScriptResponse(response.text);
        if (parsed.result == null) {
          // FS 级失败：notices 常含行号/原因——打印并抛（不烧后续配额）。
          const notices = JSON.stringify(parsed.notices || []).slice(0, 400);
          throw new Error(`FS 求值失败 rollback=${rollback}: ${notices}`);
        }
        await sleep(POST_DELAY);
        return parsed;
      }

      const docsDir = path.join(__dirname, 'corpus', 'docs');
      for (const t of TARGETS) {
        console.log(`\n==== ${t.caseId} ${t.docId} ====`);
        await send('Page.navigate', { url: 'https://cad.onshape.com/documents/' + t.docId }, sessionId);
        await sleep(LOAD_WAIT);
        const info = await evalJs(`(async()=>{try{
          const accept='application/json;charset=UTF-8; qs=0.09';
          const d0=await fetch('/api/v14/documents/${t.docId}',{credentials:'include',headers:{accept}}).then(x=>x.json());
          return {wid:(d0.defaultWorkspace&&d0.defaultWorkspace.id)||(d0.workspaces&&d0.workspaces[0]&&d0.workspaces[0].id),name:d0.name};
        }catch(e){return {err:String(e)}}})()`);
        if (!info || !info.wid) throw new Error('文档 API 不可达（会话过期？需重登调试浏览器）：' + JSON.stringify(info).slice(0, 200));
        console.log('doc:', info.name, 'wid:', info.wid);

        const docFile = fs.readdirSync(docsDir).find((f) => {
          try { return JSON.parse(fs.readFileSync(path.join(docsDir, f), 'utf8')).id === t.docId; } catch { return false; }
        });
        const doc = JSON.parse(fs.readFileSync(path.join(docsDir, docFile), 'utf8'));
        const ps = doc.partStudios.find((p) => p.elementId === t.elementId);

        // 基准面帧（1 POST，回滚 -1）
        const datumRes = await evalFeatureScript(t.docId, t.elementId, info.wid,
          `function(context is Context, queries) returns array {
  var res = [];
  for (var name in ["Front", "Top", "Right"]) {
    var p = evPlane(context, { "plane": dummyQuery(makeId(name + ".planeOp"), EntityType.FACE) });
    res = append(res, [name, p.origin / meter, p.normal / meter, p.x / meter]);
  }
  return res;
}`, -1);
        const datums = {};
        for (const row of datumRes.result) datums[row[0]] = { origin: row[1], normal: row[2], x: row[3] };
        console.log('datums:', JSON.stringify(datums).slice(0, 400));

        // 派生平面：逐回滚点 1 POST（同点多草图合并请求）
        const sketchPlanes = {};
        const byRb = new Map();
        for (const [fid, rb] of Object.entries(t.derived)) {
          const f = ps.features.features.find((x) => x.featureId === fid);
          const qs = f.parameters.find((p) => p.parameterId === 'sketchPlane').queries[0].queryString;
          if (!decodeQCompressed(qs)) throw new Error(`${fid} 平面载荷不可解码`);
          const payload = qs.match(/qCompressed\(1\.0,"([\s\S]*)",id\);/)[1];
          if (!byRb.has(rb)) byRb.set(rb, []);
          byRb.get(rb).push({ fid, payload });
        }
        for (const [rb, items] of byRb) {
          try {
            const res = await evalFeatureScript(t.docId, t.elementId, info.wid,
              `function(context is Context, queries) returns array {
  var res = [];
${planeArrayBody(items)}
  return res;
}`, rb);
            for (const row of res.result) sketchPlanes[row[0]] = { origin: row[1], normal: row[2], x: row[3] };
            console.log(`rb=${rb}:`, items.map((i) => i.fid).join(','), 'ok');
          } catch (e) {
            console.log(`rb=${rb} 失败:`, String(e.message).slice(0, 200));
            if (rateBlocked) break;
          }
        }

        const out = {
          docId: t.docId, elementId: t.elementId, probedAt: new Date().toISOString(),
          datums, sketchPlanes,
        };
        const dir = path.join(__dirname, 'corpus', 'sketch-planes');
        fs.mkdirSync(dir, { recursive: true });
        const outPath = path.join(dir, t.caseId + '.json');
        fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
        console.log('written', outPath, `（datums ${Object.keys(datums).length}、derived ${Object.keys(sketchPlanes).length}/${Object.keys(t.derived).length}）`);
        if (rateBlocked) break;
      }
      console.log(rateBlocked ? '\n部分完成（限流中止；缺的下次补）' : '\nDONE');
    } catch (e) {
      console.error('FATAL:', e.message);
      process.exitCode = 1;
    } finally {
      ws.close();
    }
  });
})();
