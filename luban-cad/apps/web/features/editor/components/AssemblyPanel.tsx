/*---------------------------------------------------------------------------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback, useEffect, useState } from 'react';
import { type BriefcaseConnection, IpcApp } from '@itwin/core-frontend';
import { openCloudIpcChannel, type OpenCloudIpcInterface } from '@luban-cad/shared';
import { Button, IconButton, Input, Text, Alert } from '@itwin/itwinui-react';
import { SvgAdd } from '@itwin/itwinui-icons-react';
import './AssemblyPanel.css';

interface AssemblyRecord {
  id: string;
  name: string;
}

interface AssemblyPanelProps {
  connection: BriefcaseConnection | null;
  isVisible: boolean;
}

/**
 * Assembly panel — shows the list of PhysicalModels (assemblies/parts) in the iModel.
 * Allows creating new assemblies via PhysicalModel.insert() on the backend.
 * Optimized with React.memo and useCallback for performance.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const AssemblyPanel: React.FC<AssemblyPanelProps> = React.memo(({ connection, isVisible }) => {
  const [assemblies, setAssemblies] = useState<AssemblyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const refresh = useCallback(async () => {
    if (!connection) { setAssemblies([]); return; }
    const fileName = connection.key;
    setIsLoading(true);
    setError(null);
    try {
      const proxy = IpcApp.makeIpcProxy<OpenCloudIpcInterface>(openCloudIpcChannel);
      const list = await proxy.listAssemblies(fileName);
      setAssemblies(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [connection]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleCreate = useCallback(async (): Promise<void> => {
    const name = newName.trim();
    if (!name || !connection) return;
    const fileName = connection.key;
    setError(null);
    try {
      const proxy = IpcApp.makeIpcProxy<OpenCloudIpcInterface>(openCloudIpcChannel);
      await proxy.createAssembly(fileName, name);
      setNewName('');
      setShowAdd(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [newName, connection, refresh]);

  if (!isVisible || !connection) return null;

  return (
    <div className="assembly-panel">
      <div className="assembly-panel-header">
        <Text variant="title" className="assembly-panel-title">装配体</Text>
        <IconButton
          size="small"
          styleType="borderless"
          label="创建新装配体"
          onClick={() => setShowAdd((v) => !v)}
        >
          <SvgAdd />
        </IconButton>
      </div>

      {showAdd && (
        <div className="assembly-add-row">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="装配体名称..."
            size="small"
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
          />
          <Button
            styleType="high-visibility"
            size="small"
            onClick={() => void handleCreate()}
          >
            创建
          </Button>
        </div>
      )}

      {error && <Alert type="negative">{error}</Alert>}
      {isLoading && <Text className="assembly-loading">加载中...</Text>}

      <div className="assembly-list">
        {assemblies.length === 0 && !isLoading && (
          <Text className="assembly-empty">暂无装配体</Text>
        )}
        {assemblies.map((asm) => (
          <div key={asm.id} className="assembly-item">
            <span className="assembly-icon">⚙</span>
            <Text className="assembly-name" title={`ID: ${asm.id}`}>{asm.name}</Text>
          </div>
        ))}
      </div>
    </div>
  );
});

// Display name for debugging
AssemblyPanel.displayName = 'AssemblyPanel';

export default AssemblyPanel;
