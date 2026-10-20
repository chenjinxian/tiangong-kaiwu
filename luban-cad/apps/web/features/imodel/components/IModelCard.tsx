import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, IconButton } from '@itwin/itwinui-react';
import { SvgDelete, SvgEdit, SvgItem } from '@itwin/itwinui-icons-react';
import type { IModel } from '../../../shared/services/imodels/client.js';
import { IMODEL_STATES } from '../../../shared/lib/constants.js';
import { useIModelImage } from '../../../shared/hooks/useIModelImage.js';
import './IModelCard.css';

interface IModelCardProps {
  iModel: IModel;
  onOpen?: (iModel: IModel) => void;
  onDelete?: (iModel: IModel) => void;
  onRename?: (iModel: IModel) => void;
}

// Format date utility - moved outside component to avoid recreation
const formatDate = (dateString: string, language: string): string => {
  return new Date(dateString).toLocaleDateString(language);
};

/**
 * iModel 卡片组件
 * 使用 React.memo 优化渲染性能
 *
 * RW4-P3-T3-1：真实缩略图（useIModelImage）+ documents ns 文案；
 * 清理 console.log 泄漏与 onDownload/onRetry/onCopy 死 props（旧调用方仅 void 丢弃）。
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const IModelCard: React.FC<IModelCardProps> = React.memo(({
  iModel,
  onOpen,
  onDelete,
  onRename,
}) => {
  const { t, i18n } = useTranslation('documents');
  const thumbnail = useIModelImage(iModel.id);

  const handleClick = useCallback(() => {
    onOpen?.(iModel);
  }, [iModel, onOpen]);

  const handleDelete = useCallback(() => {
    onDelete?.(iModel);
  }, [iModel, onDelete]);

  const handleRename = useCallback(() => {
    onRename?.(iModel);
  }, [iModel, onRename]);

  // Memoize initialization check
  const isInitialized = useMemo(() =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    iModel.state === IMODEL_STATES.INITIALIZED,
    [iModel.state]
  );

  // Get creation date - simplified logic
  const im = iModel as any;
  const createdAt = im.createdDateTime || im.createdAt;
  const updatedAt = im.lastModifiedDateTime || im.modifiedAt;
  const createdDateStr = createdAt ? formatDate(createdAt, i18n.language) : null;
  const updatedDateStr = updatedAt && updatedAt !== createdAt ? formatDate(updatedAt, i18n.language) : null;

  // Memoize display name - fallback to name if displayName is not available
  const displayName = useMemo(() =>
    iModel.displayName || iModel.name || t('imodelCard.untitled'),
    [iModel.displayName, iModel.name, t]
  );

  return (
    <div className="imodel-card">
      <div className={`imodel-card__thumbnail ${!isInitialized ? 'not-initialized' : ''}`}>
        {thumbnail ? (
          <img className="imodel-card__image" src={thumbnail} alt="" />
        ) : (
          <SvgItem className="imodel-card__icon" />
        )}
        {!isInitialized && (
          <div className="imodel-card__overlay">
            <span>{t('imodelCard.notInitialized')}</span>
          </div>
        )}
      </div>
      <div className="imodel-card__info">
        <div className="imodel-card__header">
          <h3 className="imodel-card__title" title={displayName}>{displayName}</h3>
          <div className="imodel-card__actions">
            {onRename && (
              <IconButton
                label={t('imodelCard.rename')}
                styleType="borderless"
                size="small"
                onClick={handleRename}
              >
                <SvgEdit />
              </IconButton>
            )}
            {onDelete && (
              <IconButton
                label={t('imodelCard.delete')}
                styleType="borderless"
                size="small"
                onClick={handleDelete}
              >
                <SvgDelete />
              </IconButton>
            )}
          </div>
        </div>
        {iModel.description && (
          <p className="imodel-card__description" title={iModel.description}>{iModel.description}</p>
        )}
        <div className="imodel-card__meta">
          <Badge className={isInitialized ? 'initialized' : 'not-initialized'}>
            {isInitialized ? t('imodelCard.initialized') : t('imodelCard.notInitialized')}
          </Badge>
        </div>
        <p className="imodel-card__date">
          {createdDateStr
            ? t('imodelCard.createdAt', { date: createdDateStr })
            : t('imodelCard.noDate')}
          {updatedDateStr && ` · ${t('imodelCard.updatedAt', { date: updatedDateStr })}`}
        </p>
        <Button
          styleType="high-visibility"
          size="small"
          className="imodel-card__action"
          onClick={handleClick}
          disabled={!isInitialized}
        >
          {isInitialized ? t('imodelCard.open') : t('imodelCard.initialize')}
        </Button>
      </div>
    </div>
  );
});

// Display name for debugging
IModelCard.displayName = 'IModelCard';
