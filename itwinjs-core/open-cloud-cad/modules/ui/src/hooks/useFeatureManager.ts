/**-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useCallback, useEffect, useState } from "react";

// Stub types until core package exports them
interface Feature {
  id: string;
   
  [key: string]: any;
}

 
interface FeatureManager {
  getFeatures: () => Feature[];
  deleteFeature: (id: string) => Promise<void>;
   
  editFeature: (id: string, params: any) => Promise<void>;
}

/**
 * Hook to manage features
 * @public
 */
export const useFeatureManager = (featureManager: FeatureManager | undefined) => {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | undefined>();

  useEffect(() => {
    if (!featureManager) {
      return;
    }

    // Initial load
    setFeatures(featureManager.getFeatures());

    // Subscribe to changes
    const _handleFeatureAdded = (_feature: Feature) => {
      setFeatures((prev) => [...prev, _feature]);
    };

    const _handleFeatureModified = (_feature: Feature) => {
      setFeatures((prev) =>
        prev.map((f) => (f.id === _feature.id ? _feature : f))
      );
    };

    const _handleFeatureDeleted = (_featureId: string) => {
      setFeatures((prev) => prev.filter((f) => f.id !== _featureId));
      if (selectedFeatureId === _featureId) {
        setSelectedFeatureId(undefined);
      }
    };

    // Note: These event handlers would need to be properly connected
    // to the FeatureManager's event system
    void _handleFeatureAdded;
    void _handleFeatureModified;
    void _handleFeatureDeleted;

    return () => {
      // Cleanup subscriptions
    };
  }, [featureManager, selectedFeatureId]);

  const selectFeature = useCallback((featureId: string) => {
    setSelectedFeatureId(featureId);
  }, []);

  const deleteFeature = useCallback(
    async (featureId: string) => {
      if (!featureManager) return;
      await featureManager.deleteFeature(featureId);
    },
    [featureManager]
  );

  const editFeature = useCallback(
     
    async (featureId: string, parameters: any) => {
      if (!featureManager) return;
      await featureManager.editFeature(featureId, parameters);
    },
    [featureManager]
  );

  return {
    features,
    selectedFeatureId,
    selectFeature,
    deleteFeature,
    editFeature,
  };
};
