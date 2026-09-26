import React, { useCallback, useMemo } from 'react';
import { Badge, Button, IconButton } from '@itwin/itwinui-react';
import { SvgItem, SvgDelete, SvgEdit } from '@itwin/itwinui-icons-react';
import type { IModel } from '../../../shared/services/imodels/client.js';
import { IMODEL_STATES } from '../../../shared/lib/constants.js';
import './IModelCard.css';

interface IModelCardProps {
  iModel: IModel;
  onOpen?: (iModel: IModel) => void;
  onDelete?: (iModel: IModel) => void;
  onDownload?: (iModel: IModel) => void;
  onRetry?: (iModel: IModel) => void;
  onRename?: (iModel: IModel) => void;
  onCopy?: (iModel: IModel) => void;
}

// Format date utility - moved outside component to avoid recreation
const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('zh-CN');
};

/**
 * iModel 卡片组件
 * 使用 React.memo 优化渲染性能
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const IModelCard: React.FC<IModelCardProps> = React.memo(({
  iModel,
  onOpen,
  onDelete,
  onDownload,
  onRetry,
  onRename,
  onCopy,
}) => {
  const handleClick = useCallback(() => {
    onOpen?.(iModel);
  }, [iModel, onOpen]);

  const handleDelete = useCallback(() => {
    onDelete?.(iModel);
  }, [iModel, onDelete]);

  const handleRename = useCallback(() => {
    onRename?.(iModel);
  }, [iModel, onRename]);

  // Unused handlers (props available for future use):
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void onDownload;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void onRetry;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void onCopy;

  // Memoize initialization check
  const isInitialized = useMemo(() =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    iModel.state === IMODEL_STATES.INITIALIZED,
    [iModel.state]
  );

  // Get creation date - simplified logic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const im = iModel as any;
  console.log('IModelCard data:', {
    id: im.id,
    name: im.name,
    createdDateTime: im.createdDateTime,
    createdAt: im.createdAt,
    lastModifiedDateTime: im.lastModifiedDateTime,
    modifiedAt: im.modifiedAt,
    allKeys: Object.keys(im),
  });
  const createdAt = im.createdDateTime || im.createdAt;
  const updatedAt = im.lastModifiedDateTime || im.modifiedAt;
  const createdDateStr = createdAt ? formatDate(createdAt) : null;
  const updatedDateStr = updatedAt && updatedAt !== createdAt ? formatDate(updatedAt) : null;

  // Memoize display name - fallback to name if displayName is not available
  const displayName = useMemo(() =>
    iModel.displayName || iModel.name || '未命名 iModel',
    [iModel.displayName, iModel.name]
  );


  return (
    <div className="imodel-card">
      <div className={`imodel-card__thumbnail ${!isInitialized ? 'not-initialized' : ''}`}>
        <SvgItem className="imodel-card__icon" />
        {!isInitialized && (
          <div className="imodel-card__overlay">
            <span>未初始化</span>
          </div>
        )}
      </div>
      <div className="imodel-card__info">
        <div className="imodel-card__header">
          <h3 className="imodel-card__title" title={displayName}>{displayName}</h3>
          <div className="imodel-card__actions">
            {onRename && (
              <IconButton
                label="重命名"
                styleType="borderless"
                size="small"
                onClick={handleRename}
              >
                <SvgEdit />
              </IconButton>
            )}
            {onDelete && (
              <IconButton
                label="删除"
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
            {isInitialized ? '已初始化' : '未初始化'}
          </Badge>
        </div>
        <p className="imodel-card__date">
          {createdDateStr ? `创建于 ${createdDateStr}` : '无日期'}
          {updatedDateStr && ` · 更新于 ${updatedDateStr}`}
        </p>
        <Button
          styleType="high-visibility"
          size="small"
          className="imodel-card__action"
          onClick={handleClick}
          disabled={!isInitialized}
        >
          {isInitialized ? '打开工作空间' : '初始化'}
        </Button>
      </div>
    </div>
  );
});

// Display name for debugging
IModelCard.displayName = 'IModelCard';
