/**
 * 运行时解析 18 个示例的持久 iModel（只读，不创建数据）。
 *
 * 只按 catalog 的 `projectName + imodelName` 精确匹配当前账号可见的
 * iTwin/iModel；UUID 不落静态数据。项目或 iModel 同名多义、缺失、无权限时
 * 一律不返回目标，页面回退“在文档中心查找”，不猜。
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthSession } from '@clients/auth/AuthSession.js';
import { ImodelsClient } from '@clients/imodels/ImodelsClient.js';
import { ItwinsClient } from '@clients/itwins/ItwinsClient.js';
import {
  EXAMPLE_CATALOG,
  EXAMPLE_CATALOG_PROJECT_NAMES,
  type ExampleCatalogEntry,
} from '../catalog.js';

export interface ExampleTarget {
  itwinId: string;
  imodelId: string;
  projectName: string;
  imodelName: string;
}

export interface UseExampleTargetsResult {
  isAuthenticated: boolean;
  targets: ReadonlyMap<string, ExampleTarget>;
  isLoading: boolean;
  isError: boolean;
}

type TargetRecord = Record<string, ExampleTarget>;

function imodelDisplayName(imodel: { displayName?: string; name?: string }): string | undefined {
  return imodel.displayName ?? imodel.name;
}

/** 纯匹配（测试可覆盖）：项目名唯一 + iModel 名唯一才返回目标。 */
export function matchExampleTargets(
  itwins: ReadonlyArray<{ id: string; displayName?: string }>,
  imodelsByProject: ReadonlyMap<string, ReadonlyArray<{ id: string; displayName?: string; name?: string }>>,
  entries: readonly ExampleCatalogEntry[] = EXAMPLE_CATALOG,
): TargetRecord {
  const projectCounts = new Map<string, number>();
  for (const itwin of itwins) {
    const name = itwin.displayName;
    if (name) projectCounts.set(name, (projectCounts.get(name) ?? 0) + 1);
  }

  const targets: TargetRecord = {};
  for (const entry of entries) {
    if ((projectCounts.get(entry.projectName) ?? 0) !== 1) continue;
    const project = itwins.find((itwin) => itwin.displayName === entry.projectName);
    if (!project) continue;
    const imodels = imodelsByProject.get(project.id) ?? [];
    const matches = imodels.filter((imodel) => imodelDisplayName(imodel) === entry.imodelName);
    if (matches.length !== 1) continue;
    targets[entry.id] = {
      itwinId: project.id,
      imodelId: matches[0]!.id,
      projectName: entry.projectName,
      imodelName: entry.imodelName,
    };
  }
  return targets;
}

async function resolveExampleTargets(): Promise<TargetRecord> {
  const itwins = await new ItwinsClient().list({ top: 200 });
  // 官方 ITwin 的 id/displayName 是可选的；只把完整项目交给匹配器，
  // 缺字段不猜。
  const projects = itwins.flatMap((itwin) =>
    itwin.id && itwin.displayName ? [{ id: itwin.id, displayName: itwin.displayName }] : [],
  );
  const projectNames = new Set(EXAMPLE_CATALOG_PROJECT_NAMES);
  const matchingProjects = projects.filter((project) => projectNames.has(project.displayName));
  const imodelsClient = new ImodelsClient();
  const imodelsByProject = new Map<
    string,
    ReadonlyArray<{ id: string; displayName?: string; name?: string }>
  >();
  await Promise.all(
    matchingProjects.map(async (project) => {
      imodelsByProject.set(project.id, await imodelsClient.list(project.id));
    }),
  );
  return matchExampleTargets(projects, imodelsByProject);
}

export function useExampleTargets(): UseExampleTargetsResult {
  const auth = AuthSession.getStoredAuth();
  const isAuthenticated = Boolean(auth?.accessToken);
  const query = useQuery({
    queryKey: ['example-imodel-targets'],
    queryFn: resolveExampleTargets,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const targets = useMemo(
    () => new Map(Object.entries(query.data ?? {})),
    [query.data],
  );

  return {
    isAuthenticated,
    targets,
    isLoading: isAuthenticated && query.isPending,
    isError: query.isError,
  };
}
