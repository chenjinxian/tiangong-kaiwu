// FeatureScript eval 响应的纯函数工具（无 CDP/网络依赖，便于单测）。
// 采集侧车文件前的最后解析层：BTFSValue 树 → 普通 JS 值。
function parseFsValue(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(parseFsValue);
  const bt = node.btType || '';
  if (bt.includes('BTFSValueArray')) return (node.value || []).map(parseFsValue);
  if (bt.includes('BTFSValueMap') && Array.isArray(node.value)) {
    const out = {};
    for (const entry of node.value) {
      if (!entry || !entry.key) continue;
      out[entry.key.value] = parseFsValue(entry.value);
    }
    return out;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'value')) return parseFsValue(node.value);
  return node;
}

function parseFeatureScriptResponse(raw) {
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { ...obj, result: parseFsValue(obj.result) };
}

function buildSketchRegionLambda(featureId) {
  if (!featureId || typeof featureId !== 'string') throw new Error('featureId required');
  return `function(context is Context, queries) {
  var regions = evaluateQuery(context, qSketchRegion(makeId("${featureId}")));
  var result = [];
  for (var i = 0; i < size(regions); i += 1) {
    var region = regions[i];
    var deterministicId = transientQueriesToStrings([region])[0];
    var areaM2 = evArea(context, { "entities" : region }) / (meter * meter);
    result = append(result, { "id" : deterministicId, "areaM2" : areaM2 });
  }
  return result;
}`;
}

function buildVolumeLambda() {
  return `function(context is Context, queries) {
  return evVolume(context, { "entities" : qEverything() }) / (meter * meter * meter);
}`;
}

module.exports = { parseFsValue, parseFeatureScriptResponse, buildSketchRegionLambda, buildVolumeLambda };
