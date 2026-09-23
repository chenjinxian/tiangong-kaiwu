/**-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { useCallback } from "react";

// Stub types until core package exports them
interface FeatureParameter {
  name: string;
  value: unknown;
}

interface Feature {
  id: string;
  type: string;
  parameters: FeatureParameter[];
}

/**
 * Props for FeatureTree component
 * @public
 */
export interface FeatureTreeProps {
  /** Array of features to display */
  features: Feature[];
  /** Currently selected feature ID */
  selectedFeatureId?: string;
  /** Callback when a feature is selected */
  onSelectFeature?: (featureId: string) => void;
  /** Callback when a feature is deleted */
  onDeleteFeature?: (featureId: string) => void;
  /** Callback when a feature is edited */
  onEditFeature?: (_featureId: string, _parameters: Partial<FeatureParameter>[]) => void;
  /** CSS class name */
  className?: string;
  /** Style object */
  style?: React.CSSProperties;
}

/**
 * React component for displaying and managing the feature tree
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const FeatureTree: React.FC<FeatureTreeProps> = ({
  features,
  selectedFeatureId,
  onSelectFeature,
  onDeleteFeature,
  className,
  style,
}) => {
  const handleSelect = useCallback(
    (featureId: string) => {
      onSelectFeature?.(featureId);
    },
    [onSelectFeature]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, featureId: string) => {
      e.stopPropagation();
      onDeleteFeature?.(featureId);
    },
    [onDeleteFeature]
  );

  return (
    <div className={className} style={{ padding: "8px", ...style }}>
      <h3 style={{ marginTop: 0 }}>Feature Tree</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {features.map((feature) => (
          <li
            key={feature.id}
            onClick={() => handleSelect(feature.id)}
            style={{
              padding: "8px 12px",
              margin: "4px 0",
              borderRadius: "4px",
              cursor: "pointer",
              backgroundColor: selectedFeatureId === feature.id ? "#e3f2fd" : "transparent",
              border: `1px solid ${selectedFeatureId === feature.id ? "#2196f3" : "#e0e0e0"}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 500 }}>{feature.type}</div>
              <div style={{ fontSize: "0.85em", color: "#666" }}>
                {feature.parameters.length} parameters
              </div>
            </div>
            <button
              onClick={(e) => handleDelete(e, feature.id)}
              style={{
                padding: "4px 8px",
                backgroundColor: "#f44336",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {features.length === 0 && (
        <div style={{ textAlign: "center", color: "#999", padding: "20px" }}>
          No features yet. Create a sketch and add features.
        </div>
      )}
    </div>
  );
};
