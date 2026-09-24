/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useRef, useState } from 'react';
import { IModelApp, type IModelConnection, ScreenViewport, ViewCreator3d, ViewState, SpatialViewState } from '@itwin/core-frontend';

export interface UseViewportOptions {
  iModel: IModelConnection | undefined;
  viewState?: ViewState;
  viewportRef: React.RefObject<HTMLDivElement>;
}

export interface UseViewportResult {
  viewport: ScreenViewport | undefined;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to create and manage ScreenViewport
 *
 * @example
 * ```tsx
 * const viewportRef = useRef<HTMLDivElement>(null);
 * const { viewport } = useViewport({
 *   iModel,
 *   viewportRef
 * });
 * ```
 */
export function useViewport(options: UseViewportOptions): UseViewportResult {
  const { iModel, viewState, viewportRef } = options;
  const [viewport, setViewport] = useState<ScreenViewport | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const viewportRefInternal = useRef<ScreenViewport | undefined>();

  useEffect(() => {
    if (!iModel || !viewportRef.current) {
      return;
    }

    setIsLoading(true);
    setError(null);

    // Capture ref before async operations so React Strict Mode unmount doesn't null it
    const parentDiv = viewportRef.current;
    // Cancellation flag for React Strict Mode double-invocation
    let cancelled = false;

    const setupViewport = async (): Promise<void> => {
      try {
        // Get default view if not provided
        const view = viewState ?? (await getDefaultViewState(iModel));

        // If effect was cleaned up while we were awaiting, abort
        if (cancelled) return;

        if (!view) {
          throw new Error('No view state available');
        }

        if (!parentDiv) {
          throw new Error('Viewport container not found');
        }

        // Remove any existing viewport
        if (viewportRefInternal.current) {
          IModelApp.viewManager.dropViewport(viewportRefInternal.current);
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          viewportRefInternal.current.dispose();
          viewportRefInternal.current = undefined;
        }

        const newViewport = ScreenViewport.create(parentDiv, view);
        viewportRefInternal.current = newViewport;

        // Add to ViewManager
        IModelApp.viewManager.addViewport(newViewport);

        // IMPORTANT: Ensure all available categories and models are displayed
        // This is required for editing tools to work properly
        await setupViewCategoriesAndModels(newViewport);

        setViewport(newViewport);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void setupViewport();

    return () => {
      cancelled = true;
      if (viewportRefInternal.current) {
        IModelApp.viewManager.dropViewport(viewportRefInternal.current);
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        viewportRefInternal.current.dispose();
        viewportRefInternal.current = undefined;
        setViewport(undefined);
      }
    };
  }, [iModel, viewState, viewportRef]);

  return {
    viewport,
    isLoading,
    error,
  };
}

/**
 * Get default view state from iModel
 */
async function getDefaultViewState(iModel: IModelConnection): Promise<ViewState | undefined> {
  // Get view definitions from iModel
  const viewSpecs = await iModel.views.queryProps({});
  if (viewSpecs.length > 0) {
    // Use first view or find a default named view
    const defaultViewSpec = viewSpecs.find((v) => v.code.value === 'Default') ?? viewSpecs[0];
    const view = await iModel.views.load(defaultViewSpec.id);

    // For spatial views, ensure we have all categories and models
    // This is critical for editing tools to work properly
    if (view instanceof SpatialViewState) {
      await ensureViewHasCategoriesAndModels(view, iModel);
    }

    return view;
  }

  // No view definitions found - create a default 3D view (e.g. empty iModel)
  try {
    const creator = new ViewCreator3d(iModel);
    const view = await creator.createDefaultView();

    // Ensure view has categories and models for editing tools
    if (view instanceof SpatialViewState) {
      await ensureViewHasCategoriesAndModels(view, iModel);
    }

    return view;
  } catch {
    return undefined;
  }
}

/**
 * Ensure the view has all available categories and models displayed.
 * This is critical for editing tools to work properly.
 * Following display-test-app's pattern (IdPicker.ts)
 */
async function ensureViewHasCategoriesAndModels(view: SpatialViewState, iModel: IModelConnection): Promise<void> {
  // Query for available categories and add them to the view
  const categoryIds = await queryAllSpatialCategoryIds(iModel);
  if (categoryIds.length > 0) {
    for (const catId of categoryIds) {
      if (!view.categorySelector.has(catId)) {
        view.categorySelector.addCategories([catId]);
      }
    }
    // eslint-disable-next-line no-console
    console.log('[useViewport] Added', categoryIds.length, 'categories to view');
  }

  // Query for available models and add them to the view
  const modelIds = await queryAllPhysicalModelIds(iModel);
  if (modelIds.length > 0) {
    for (const modId of modelIds) {
      if (!view.modelSelector.has(modId)) {
        view.modelSelector.addModels([modId]);
      }
    }
    // eslint-disable-next-line no-console
    console.log('[useViewport] Added', modelIds.length, 'models to view');
  }
}

/**
 * Query for all SpatialCategory IDs in the iModel.
 * Based on display-test-app's IdPicker.ts pattern.
 */
async function queryAllSpatialCategoryIds(iModel: IModelConnection): Promise<string[]> {
  try {
    // Query all SpatialCategories (not just used ones, to ensure we have them for new elements)
    const query = `SELECT ECInstanceId FROM BisCore.SpatialCategory`;
    const rows: string[] = [];
    for await (const row of iModel.createQueryReader(query)) {
      rows.push(row[0] as string);
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * Query for all PhysicalModel IDs in the iModel
 */
async function queryAllPhysicalModelIds(iModel: IModelConnection): Promise<string[]> {
  try {
    const query = `SELECT ECInstanceId FROM BisCore.PhysicalModel`;
    const rows: string[] = [];
    for await (const row of iModel.createQueryReader(query)) {
      rows.push(row[0] as string);
    }
    return rows;
  } catch {
    return [];
  }
}

/**
 * Setup viewport with all categories and models for editing.
 * Called after viewport is created to ensure editing tools work.
 */
async function setupViewCategoriesAndModels(viewport: ScreenViewport): Promise<void> {
  const view = viewport.view;
  if (!(view instanceof SpatialViewState)) {
    return;
  }

  // Query and add all categories/models (they may have been added to iModel after view was saved)
  const iModel = viewport.iModel;

  // Get all categories and ensure they're in the view
  const categoryIds = await queryAllSpatialCategoryIds(iModel);
  let categoriesChanged = false;
  for (const catId of categoryIds) {
    if (!view.categorySelector.has(catId)) {
      view.categorySelector.addCategories([catId]);
      categoriesChanged = true;
    }
  }

  // Get all models and ensure they're in the view
  const modelIds = await queryAllPhysicalModelIds(iModel);
  let modelsChanged = false;
  for (const modId of modelIds) {
    if (!view.modelSelector.has(modId)) {
      view.modelSelector.addModels([modId]);
      modelsChanged = true;
    }
  }

  if (categoriesChanged || modelsChanged) {
    // eslint-disable-next-line no-console
    console.log('[useViewport] View updated with', categoryIds.length, 'categories and', modelIds.length, 'models');
    // Sync the viewport with the updated view state
    viewport.synchWithView();
  }
}
