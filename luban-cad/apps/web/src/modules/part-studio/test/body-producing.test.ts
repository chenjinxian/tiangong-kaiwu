/**
 * BODY_PRODUCING_FEATURE_TYPES 完备性守卫（2026-11-08）。
 *
 * 该常量只服务 legacy 回退判据（无 body 读面时的 hasBodies 判定、插入后取景、
 * 消隐回退），不是第二套体模型。新增体产出/体修改型 FeatureType 时必须同步，
 * 否则插入后可能不刷新视图/树。这里钉住当前口径：体修改型（moveFace 等）
 * 与体产出型同列；草图/圆角/孔等非产体特征不列入。
 */
import { describe, expect, it } from 'vitest';
import { BODY_PRODUCING_FEATURE_TYPES } from '../types.js';

describe('BODY_PRODUCING_FEATURE_TYPES', () => {
  it('包含体产出与体修改型新特征', () => {
    for (const type of [
      'extrude',
      'revolve',
      'booleanBodies',
      'featurePattern',
      'featureMirror',
      'moveFace',
      'faceExtrude',
      'transform',
      'splitPart',
    ] as const) {
      expect(BODY_PRODUCING_FEATURE_TYPES, type).toContain(type);
    }
  });

  it('不把非产体特征列为 legacy 产体判据', () => {
    for (const type of ['sketch', 'cPlane', 'fillet', 'chamfer', 'hole', 'shell'] as const) {
      expect(BODY_PRODUCING_FEATURE_TYPES, type).not.toContain(type);
    }
  });

  it('无重复条目（合法性由 LubanFeatureType 编译期约束保证）', () => {
    expect(new Set(BODY_PRODUCING_FEATURE_TYPES).size).toBe(BODY_PRODUCING_FEATURE_TYPES.length);
  });
});
