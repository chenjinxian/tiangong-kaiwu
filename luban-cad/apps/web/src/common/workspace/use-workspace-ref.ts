import { useParams, useSearchParams } from 'react-router-dom';
import { parseWorkspaceRef, type WorkspaceRef } from './workspace-ref.js';

export function useWorkspaceRef(): WorkspaceRef | null {
  const { iTwinId, iModelId } = useParams<{ iTwinId: string; iModelId: string }>();
  const [searchParams] = useSearchParams();
  return parseWorkspaceRef({
    iTwinId,
    iModelId,
    model: searchParams.get('model'),
  });
}
