/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * DocumentGrid（Task 5）：网格视图——DocumentTile 的 auto-fill 网格
 * （桌面约 4 列，Onshape 卡片密度）。
 */

import React from 'react';
import type { DocumentSummary } from '../types.js';
import { DocumentTile } from './DocumentTile.js';

export interface DocumentGridProps {
  documents: DocumentSummary[];
  isFavorite: (id: string) => boolean;
  isSelected: (id: string) => boolean;
  formatModified: (doc: DocumentSummary) => string;
  buildMenuItems: (doc: DocumentSummary, close: () => void) => React.JSX.Element[];
  onOpen: (doc: DocumentSummary) => void;
  onToggleFavorite: (doc: DocumentSummary) => void;
}

export function DocumentGrid({
  documents,
  isFavorite,
  isSelected,
  formatModified,
  buildMenuItems,
  onOpen,
  onToggleFavorite,
}: DocumentGridProps): React.JSX.Element {
  return (
    <div className="documents-grid">
      {documents.map((doc) => (
        <DocumentTile
          key={doc.id}
          doc={doc}
          isFavorite={isFavorite(doc.id)}
          isSelected={isSelected(doc.id)}
          modifiedLabel={formatModified(doc)}
          menuItems={(close) => buildMenuItems(doc, close)}
          onOpen={() => onOpen(doc)}
          onToggleFavorite={() => onToggleFavorite(doc)}
        />
      ))}
    </div>
  );
}
