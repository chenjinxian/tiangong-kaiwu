export interface WorkspaceRef {
  iTwinId: string;
  iModelId: string;
  /** B 模式：文档内活动 Part Studio/Model；A 模式可缺省。 */
  modelId?: string;
}

export interface WorkspaceRefParams {
  iTwinId?: string;
  iModelId?: string;
  model?: string | null;
}

export function parseWorkspaceRef(params: WorkspaceRefParams): WorkspaceRef | null {
  if (!params.iTwinId || !params.iModelId) return null;
  return {
    iTwinId: params.iTwinId,
    iModelId: params.iModelId,
    ...(params.model ? { modelId: params.model } : {}),
  };
}

export function workspaceRefPath(ref: WorkspaceRef): string {
  const base = `/documents/${encodeURIComponent(ref.iTwinId)}/${encodeURIComponent(ref.iModelId)}`;
  return ref.modelId ? `${base}?model=${encodeURIComponent(ref.modelId)}` : base;
}
