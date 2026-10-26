// qCompressed 解码器契约测试（Node.js 内置 node:test，无第三方依赖）
// 样本来源：corpus/docs 的真实 Isomantle / Calculate-Bounds 语料（内联等价字符串，
// 保证测试不依赖 corpus 目录被重新生成）。
const test = require('node:test');
const assert = require('node:assert/strict');

const { decodeQCompressed, parseEdgeQuery } = require('./qcompressed-lib.js');

// Isomantle / Fillet 5（featureId FCWoVHcpyGWqJbb_3）q0/q1/q2：内联 %B5$，CAP_EDGE，
// 源 Extrude 3；sketchEntityId 分别对应 Sketch 4 的 3 个圆实体（后缀 R4R5R6R7 为消歧码）。
const FILLET5_Q0 = 'query=qCompressed(1.0,"%B5$QueryM6S12$disambiguationDataA1M2S12$disambiguationTypeS13$ORIGINAL_DEPENDENCYS9$originalsA1C0M5Sa$entityTypeBa$EntityTypeS4$EDGESb$historyTypeS8$CREATIONSb$operationIdB2$IdA1S11.6$FUWSsAhFQqeUaQJ_3wireOpS9$queryTypeSd$SKETCH_ENTITYSe$sketchEntityIdSc$NFV8fKBSOMIUR4R5R6R7S7$isStartFR8CbA1S11.9$F0rTG271Y1X9Wh3_3opExtrudeRbS8$CAP_EDGE",id);';
const FILLET5_Q1 = 'query=qCompressed(1.0,"%B5$QueryM6S12$disambiguationDataA1M2S12$disambiguationTypeS13$ORIGINAL_DEPENDENCYS9$originalsA1C0M5Sa$entityTypeBa$EntityTypeS4$EDGESb$historyTypeS8$CREATIONSb$operationIdB2$IdA1S11.6$FUWSsAhFQqeUaQJ_3wireOpS9$queryTypeSd$SKETCH_ENTITYSe$sketchEntityIdSc$aJJO9wtj73bzR4R5R6R7S7$isStartFR8CbA1S11.9$F0rTG271Y1X9Wh3_3opExtrudeRbS8$CAP_EDGE",id);';
const FILLET5_Q2 = 'query=qCompressed(1.0,"%B5$QueryM6S12$disambiguationDataA1M2S12$disambiguationTypeS13$ORIGINAL_DEPENDENCYS9$originalsA1C0M5Sa$entityTypeBa$EntityTypeS4$EDGESb$historyTypeS8$CREATIONSb$operationIdB2$IdA1S11.6$FUWSsAhFQqeUaQJ_3wireOpS9$queryTypeSd$SKETCH_ENTITYSe$sketchEntityIdSc$whUbq0LCgS1XR4R5R6R7S7$isStartFR8CbA1S11.9$F0rTG271Y1X9Wh3_3opExtrudeRbS8$CAP_EDGE",id);';

// Isomantle / Fillet 6（featureId FnVhVFRbnzFynD4_4）q0：&214$（hex=532 字节）zlib 压缩；
// 解出 DSL 含 opExtrude + opBoolean（derivedFrom/布尔复合链）→ parseEdgeQuery 必须 null。
const FILLET6_Q0 = 'query=qCompressed(1.0,"&214$eJxlUF1z4iAU/TO3jzoSExsfYyRK23wsZKfalwwJjNJqSAnZXfvrF83M7ox9gOFyOF88rAL4MUhzSQNWg5BG/ZIiMfocefEsDejsujPkgVA9P9fqMHCrdLvmlkco9b4j5aWTDM0hp2RDsuilWuMCZ2ucxXu2BG3UQbX81I/yjINsrbKXK2vFAf8bmA94vcEu01H1VpvxMoSY4qgkeeYA3UlzsyRi5QEREWIITReQ7JZv71vSiJyfSIcr/7cyMu+c++e16E1IAHvGZbytcFaScs8k9B/SNscxABGsmc4hWWzq7idLB3+BrO5u/xHQBX2kIV3SmjZUUMkmaD4NwPU62v9o3IxplpCcsflAu6L1imLovypfd/iPNYOQtHH12Ssuyupa9Y48QeH00fFrrU+St7pbjQfH8iHOi/0tDqIo+O46Qc43fG2L5Onps9/Nm+St8l1cFN6beDP3uHFLgBMOIMV0g/8CE9qn3A==",id);';

// Isomantle / Fillet 7（FijXULkVCPfNikb_4）q0：唯一源 Extrude 7，外层 SWEPT_EDGE。
const FILLET7_Q0 = 'query=qCompressed(1.0,"%B5$QueryM5S12$disambiguationDataA1M2S12$disambiguationTypeS13$ORIGINAL_DEPENDENCYS9$originalsA2C0M5Sa$entityTypeBa$EntityTypeS4$EDGESb$historyTypeS8$CREATIONSb$operationIdB2$IdA1S11.6$FX9ZjHIcdOalIpE_4wireOpS9$queryTypeSd$SKETCH_ENTITYSe$sketchEntityIdSc.1$ArlbImWKhaqd2C0M5R4R5R6R7R8RaRbRcRdS-12.1$3R4R5R6R7R8CbA1S11.9$F8WnPFJJqsX3cFZ_4opExtrudeRbSa$SWEPT_EDGE",id);';

// Calculate-Bounds / Chamfer 1 q1：唯一源 Extrude，CAP_EDGE，isStart T。
const CB_CHAMFER_Q1 = 'query=qCompressed(1.0,"%B5$QueryM6S12$disambiguationDataA1M2S12$disambiguationTypeS13$ORIGINAL_DEPENDENCYS9$originalsA1C0M5Sa$entityTypeBa$EntityTypeS4$EDGESb$historyTypeS8$CREATIONSb$operationIdB2$IdA1S11.6$FfZnWnsQnHH9lKK_1wireOpS9$queryTypeSd$SKETCH_ENTITYSe$sketchEntityIdS24$iRVgKMVQ-CQwZ-kTnI-hpkv-4okMDZmfQPeeR4R5R6R7S7$isStartTR8CbA1S11.9$FxDFjm3Zp0lsMU0_1opExtrudeRbS8$CAP_EDGE",id);';
// Calculate-Bounds / Chamfer 1 q2：唯一源 Extrude，SWEPT_EDGE，无 isStart → 缺省 false。
const CB_CHAMFER_Q2 = 'query=qCompressed(1.0,"%B5$QueryM5S12$disambiguationDataA1M2S12$disambiguationTypeS13$ORIGINAL_DEPENDENCYS9$originalsA2C0M5Sa$entityTypeBa$EntityTypeS4$EDGESb$historyTypeS8$CREATIONSb$operationIdB2$IdA1S11.6$FfZnWnsQnHH9lKK_1wireOpS9$queryTypeSd$SKETCH_ENTITYSe$sketchEntityIdS24.6$9RlTxNGB-aYtg-8oNk-UPzV-2RffdIrJay6mbottomC0M5R4R5R6R7R8RaRbRcRdS-12.4$leftR4R5R6R7R8CbA1S11.9$FxDFjm3Zp0lsMU0_1opExtrudeRbSa$SWEPT_EDGE",id);';

// ---------------------------------------------------------------------------
// decodeQCompressed
// ---------------------------------------------------------------------------
test('decodeQCompressed：%B5$ 内联 DSL 原样返回（compressed=false，version=B5）', () => {
  const dec = decodeQCompressed(FILLET5_Q0);
  assert.ok(dec);
  assert.equal(dec.compressed, false);
  assert.equal(dec.version, 'B5');
  assert.ok(dec.dsl.startsWith('%B5$Query'));
  assert.ok(dec.dsl.includes('F0rTG271Y1X9Wh3_3opExtrude'));
});

test('decodeQCompressed：&214$（hex 声明长度）zlib 解压 → compressed=true 且 DSL 可读', () => {
  const dec = decodeQCompressed(FILLET6_Q0);
  assert.ok(dec);
  assert.equal(dec.compressed, true);
  assert.equal(dec.version, 'B5');
  assert.ok(dec.dsl.startsWith('%B5$Query'));
  // 声明长度 0x214=532 字节（十六进制，不是十进制 214）
  assert.equal(Buffer.byteLength(dec.dsl, 'utf8'), 0x214);
  // 复合链证据：同一 DSL 内既有 opExtrude 又有 opBoolean
  assert.ok(dec.dsl.includes('FmErk1XPn2PPusz_4opExtrude'));
  assert.ok(dec.dsl.includes('opBoolean'));
});

test('decodeQCompressed：坏输入/未知 payload 一律 null', () => {
  assert.equal(decodeQCompressed(null), null);
  assert.equal(decodeQCompressed(undefined), null);
  assert.equal(decodeQCompressed(123), null);
  assert.equal(decodeQCompressed('query=qSketchRegion(id + "F1", true);'), null);
  // 未识别的 DSL 版本
  assert.equal(decodeQCompressed('query=qCompressed(1.0,"%B6$QueryM1",id);'), null);
  // 未知 payload 形态
  assert.equal(decodeQCompressed('query=qCompressed(1.0,"hello",id);'), null);
  // 声明长度非 hex
  assert.equal(decodeQCompressed('query=qCompressed(1.0,"&zz$AAAA",id);'), null);
  // base64 字符集非法
  assert.equal(decodeQCompressed('query=qCompressed(1.0,"&1$!!!=",id);'), null);
  // zlib 流损坏
  assert.equal(decodeQCompressed('query=qCompressed(1.0,"&10$AAAAAAAAAAAAAAAA",id);'), null);
  // 声明长度不符（0x215=533 ≠ 实际 532）→ 拒绝
  const wrongLen = FILLET6_Q0.replace('&214$', '&215$');
  assert.notEqual(wrongLen, FILLET6_Q0);
  assert.equal(decodeQCompressed(wrongLen), null);
});

// ---------------------------------------------------------------------------
// parseEdgeQuery
// ---------------------------------------------------------------------------
test('parseEdgeQuery：Fillet 5 q0 → 唯一源 Extrude + 外层 CAP_EDGE + isStart false', () => {
  const dec = decodeQCompressed(FILLET5_Q0);
  assert.deepEqual(parseEdgeQuery(dec.dsl), {
    sourceFeatureId: 'F0rTG271Y1X9Wh3_3',
    sourceOp: 'Extrude',
    queryType: 'CAP_EDGE',
    isStart: false,
    sketchEntityIds: ['NFV8fKBSOMIUR4R5R6R7'],
    sketchFeatureIds: ['FUWSsAhFQqeUaQJ_3'],
  });
});

test('parseEdgeQuery：Fillet 5 三条查询各带 1 个 sketchEntityId（Sketch 4 三圆）', () => {
  const parsed = [FILLET5_Q0, FILLET5_Q1, FILLET5_Q2]
    .map((q) => parseEdgeQuery(decodeQCompressed(q).dsl));
  // 原文 token 保留消歧后缀；前缀即 Sketch 4 的圆实体 entityId
  assert.deepEqual(parsed.map((p) => p.sketchEntityIds), [
    ['NFV8fKBSOMIUR4R5R6R7'],
    ['aJJO9wtj73bzR4R5R6R7'],
    ['whUbq0LCgS1XR4R5R6R7'],
  ]);
  assert.deepEqual(parsed.map((p) => p.sketchEntityIds[0].replace(/R4R5R6R7$/, '')), [
    'NFV8fKBSOMIU', 'aJJO9wtj73bz', 'whUbq0LCgS1X',
  ]);
  for (const p of parsed) {
    assert.deepEqual(p.sketchFeatureIds, ['FUWSsAhFQqeUaQJ_3']);
    assert.equal(p.queryType, 'CAP_EDGE');
    assert.equal(p.isStart, false);
  }
});

test('parseEdgeQuery：Fillet 6 zlib DSL 为多源复合链 → null（不猜）', () => {
  const dec = decodeQCompressed(FILLET6_Q0);
  assert.ok(dec && dec.compressed);
  assert.equal(parseEdgeQuery(dec.dsl), null);
});

test('parseEdgeQuery：Fillet 7 → SWEPT_EDGE（源 Extrude，isStart 缺省 false）', () => {
  const dec = decodeQCompressed(FILLET7_Q0);
  assert.deepEqual(parseEdgeQuery(dec.dsl), {
    sourceFeatureId: 'F8WnPFJJqsX3cFZ_4',
    sourceOp: 'Extrude',
    queryType: 'SWEPT_EDGE',
    isStart: false,
    sketchEntityIds: ['ArlbImWKhaqd2C0M5R4R5R6R7R8RaRbRcRd'],
    sketchFeatureIds: ['FX9ZjHIcdOalIpE_4'],
  });
});

test('parseEdgeQuery：isStart 取最后一次出现（Calculate-Bounds Chamfer 1：T / 缺省）', () => {
  const q1 = parseEdgeQuery(decodeQCompressed(CB_CHAMFER_Q1).dsl);
  assert.deepEqual(q1, {
    sourceFeatureId: 'FxDFjm3Zp0lsMU0_1',
    sourceOp: 'Extrude',
    queryType: 'CAP_EDGE',
    isStart: true,
    sketchEntityIds: ['iRVgKMVQ-CQwZ-kTnI-hpkv-4okMDZmfQPeeR4R5R6R7'],
    sketchFeatureIds: ['FfZnWnsQnHH9lKK_1'],
  });
  const q2 = parseEdgeQuery(decodeQCompressed(CB_CHAMFER_Q2).dsl);
  assert.deepEqual(q2, {
    sourceFeatureId: 'FxDFjm3Zp0lsMU0_1',
    sourceOp: 'Extrude',
    queryType: 'SWEPT_EDGE',
    isStart: false,
    sketchEntityIds: ['9RlTxNGB-aYtg-8oNk-UPzV-2RffdIrJay6mbottomC0M5R4R5R6R7R8RaRbRcRd'],
    sketchFeatureIds: ['FfZnWnsQnHH9lKK_1'],
  });
});

test('parseEdgeQuery：缺源 op / 多源 / 缺查询类型 → null', () => {
  // 无源 op（只有 originals 的 wireOp / import 之外的普通记号）
  assert.equal(parseEdgeQuery('%B5$QueryM2S9$originalsA1C0M5Sa$entityTypeBa$EntityTypeS4$EDGES'), null);
  // 多源（Extrude + Boolean）
  assert.equal(parseEdgeQuery('%B5$QueryM6S11.9$F1opExtrudeRbS8$CAP_EDGES11.9$F2opBooleanReS5$MERGE'), null);
  // 唯一源但不是 Extrude/Revolve（Import）
  assert.equal(parseEdgeQuery('%B5$QueryM5S11.9$F0importOpS9$queryTypeS6$IMPORT'), null);
  // 唯一源但缺查询类型（op 后无 R 结构回指 → 识别不到 op，也返回 null）
  assert.equal(parseEdgeQuery('%B5$QueryM2S11.9$F1opExtrude'), null);
  // 非 B5/非字符串
  assert.equal(parseEdgeQuery('%B6$QueryM1'), null);
  assert.equal(parseEdgeQuery(''), null);
  assert.equal(parseEdgeQuery(null), null);
});

test('parseEdgeQuery：无 sketchEntityId 时返回空数组（字段恒存在，不 undefined）', () => {
  assert.deepEqual(parseEdgeQuery('%B5$QueryM2S11.9$FXopExtrudeRbS8$CAP_EDGE'), {
    sourceFeatureId: 'FX',
    sourceOp: 'Extrude',
    queryType: 'CAP_EDGE',
    isStart: false,
    sketchEntityIds: [],
    sketchFeatureIds: [],
  });
});
