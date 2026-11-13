/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * 特征/草图对话框头部按钮（Onshape live f4/f5/f6 复核 2026-11-13）：
 * - ✓ = 28×28 实心绿 #419228（禁用 #d9e9d4）+ 白色对勾 **sprite** `ok-button`
 *   （像素采样：启用底 rgb(65,146,40)、禁用底 rgb(217,233,212)）。
 * - ✗ = 28×28 **透明底** + 红色 X sprite `cancel-button`（默认 #BD3039）——
 *   旧实现为实心红底白 X，与 live 不符。
 * 类名沿用 `part-studio-feature-dialog__*`（全部特征对话框共享同一皮肤；
 * 草图对话框在 SketchDialog 内用同款按钮类名）。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { OnshapeIcon } from '../icons/onshape-icons.js';

export interface DialogHeaderButtonsProps {
  /** ✓ 禁用（提交中/只读/未满足必须字段）。 */
  disabled?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmTestId?: string;
  cancelTestId?: string;
}

export function DialogHeaderButtons({
  disabled,
  onConfirm,
  onCancel,
  confirmTestId,
  cancelTestId,
}: DialogHeaderButtonsProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="part-studio-feature-dialog__header-actions">
      <button
        type="button"
        className="part-studio-feature-dialog__confirm"
        aria-label={t('partStudio.featureDialog.confirm')}
        disabled={disabled}
        onClick={onConfirm}
        data-testid={confirmTestId}
      >
        <OnshapeIcon name="ok-button" size={20} />
      </button>
      <button
        type="button"
        className="part-studio-feature-dialog__cancel"
        aria-label={t('partStudio.featureDialog.cancel')}
        onClick={onCancel}
        data-testid={cancelTestId}
      >
        <OnshapeIcon name="cancel-button" size={20} />
      </button>
    </div>
  );
}
