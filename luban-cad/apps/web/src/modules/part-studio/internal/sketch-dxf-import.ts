/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 草图「插入 DXF 或 DWG」文件选择与提交（2026-11-12 首切片）。
 * 仅接受 .dxf（ASCII），解析层在 `dxf-import.ts`；导入结果并入当前活动草图
 * entities，一次 `updateSketch` 提交（可撤销，服务器重建面域）。DWG（二进制）
 * 诚实拒收，提示仅支持 DXF。
 */
import { IModelApp, NotifyMessageDetails, OutputMessagePriority } from '@itwin/core-frontend';
import i18next from 'i18next';
import { getSketchSystem } from '../hooks/useSketchSystem.js';
import { parseDxfSketchEntities } from './dxf-import.js';

let picking = false;

function notify(priority: OutputMessagePriority, message: string): void {
  IModelApp.notifications.outputMessage(new NotifyMessageDetails(priority, message));
}

/** 打开文件选择并导入到活动草图；失败/空结果不写数据。 */
export function importSketchDxfFromFile(): void {
  const system = getSketchSystem();
  const sketch = system?.activeSketch;
  if (!system || !sketch) {
    notify(OutputMessagePriority.Error, i18next.t('partStudio.sketch.insertDxf.notOpen'));
    return;
  }
  if (picking)
    return;
  picking = true;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.dxf';
  input.style.display = 'none';
  input.addEventListener('cancel', () => {
    picking = false;
    input.remove();
  });
  input.addEventListener('change', () => {
    picking = false;
    const file = input.files?.[0];
    input.remove();
    if (!file)
      return;
    if (!file.name.toLowerCase().endsWith('.dxf')) {
      notify(OutputMessagePriority.Error, i18next.t('partStudio.sketch.insertDxf.onlyDxf'));
      return;
    }
    void file.text().then(async (text) => {
      const maxId = sketch.entities.reduce((max, entity) => Math.max(max, entity.id), 0);
      const parsed = parseDxfSketchEntities(text, maxId);
      if (parsed.entities.length === 0) {
        notify(OutputMessagePriority.Info, i18next.t('partStudio.sketch.insertDxf.empty'));
        return;
      }
      const result = await system.applyUpdate(
        [...sketch.entities, ...parsed.entities],
        sketch.constraints,
      );
      if (!result.ok) {
        notify(
          OutputMessagePriority.Error,
          i18next.t('partStudio.sketch.insertDxf.failed', { message: result.error ?? '' }),
        );
        return;
      }
      notify(
        OutputMessagePriority.Success,
        parsed.skipped > 0
          ? i18next.t('partStudio.sketch.insertDxf.successSkipped', {
            count: parsed.entities.length, units: parsed.units, skipped: parsed.skipped,
          })
          : i18next.t('partStudio.sketch.insertDxf.success', {
            count: parsed.entities.length, units: parsed.units,
          }),
      );
    }).catch((err: unknown) => {
      notify(
        OutputMessagePriority.Error,
        i18next.t('partStudio.sketch.insertDxf.failed', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    });
  });
  document.body.appendChild(input);
  input.click();
}
