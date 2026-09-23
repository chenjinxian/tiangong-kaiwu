/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Measurement Manager Hook
 * Manages measurement state, history, and persistence
 */

import { useCallback, useEffect, useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';

export type MeasurementType = 'distance' | 'area' | 'volume' | 'length' | 'location';

export interface MeasurementRecord {
  id: string;
  type: MeasurementType;
  value: number;
  unit: string;
  description?: string;
  timestamp: number;
  screenshot?: string;
}

export interface UseMeasurementManagerReturn {
  // Current state
  activeMeasurement: MeasurementType | null;
  measurements: MeasurementRecord[];

  // Actions
  startMeasurement: (type: MeasurementType) => Promise<void>;
  stopMeasurement: () => void;
  clearMeasurements: () => void;
  deleteMeasurement: (id: string) => void;

  // Tool state
  isToolActive: boolean;
}

export function useMeasurementManager(): UseMeasurementManagerReturn {
  const [activeMeasurement, setActiveMeasurement] = useState<MeasurementType | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([]);
  const [isToolActive, setIsToolActive] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('open-cloud-cad-measurements');
    if (saved) {
      try {
        setMeasurements(JSON.parse(saved));
      } catch {
        console.warn('[Measurement] Failed to parse saved measurements');
      }
    }
  }, []);

  // Save to localStorage when measurements change
  useEffect(() => {
    localStorage.setItem('open-cloud-cad-measurements', JSON.stringify(measurements));
  }, [measurements]);

  // Start measurement
  const startMeasurement = useCallback(async (type: MeasurementType) => {
    // Stop current measurement first
    await IModelApp.tools.run('Measure.Clear');

    const toolId = getToolIdByType(type);
    const success = await IModelApp.tools.run(toolId);

    if (success) {
      setActiveMeasurement(type);
      setIsToolActive(true);

      // Add a mock measurement for testing
      // In real implementation, this would come from the measurement tool
      const mockRecord: MeasurementRecord = {
        id: `meas_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        value: Math.random() * 100,
        unit: type === 'area' ? 'm²' : type === 'volume' ? 'm³' : 'm',
        timestamp: Date.now(),
      };
      setMeasurements((prev) => [mockRecord, ...prev]);
    }
  }, []);

  // Stop measurement
  const stopMeasurement = useCallback(() => {
    IModelApp.tools.run('Measure.Clear');
    setActiveMeasurement(null);
    setIsToolActive(false);
  }, []);

  // Clear all measurement history
  const clearMeasurements = useCallback(() => {
    setMeasurements([]);
    // Clear from view if measurement manager exists
    try {
      // @ts-ignore - measureManager may not exist
      IModelApp.measureManager?.clearMeasurements();
    } catch {
      // Ignore if not available
    }
  }, []);

  // Delete single measurement
  const deleteMeasurement = useCallback((id: string) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return {
    activeMeasurement,
    measurements,
    startMeasurement,
    stopMeasurement,
    clearMeasurements,
    deleteMeasurement,
    isToolActive,
  };
}

// Tool ID mapping
function getToolIdByType(type: MeasurementType): string {
  switch (type) {
    case 'distance':
      return 'Measure.Distance';
    case 'area':
      return 'Measure.Area';
    case 'volume':
      return 'Measure.Volume';
    case 'length':
      return 'Measure.Length';
    case 'location':
      return 'Measure.Location';
    default:
      return 'Measure.Distance';
  }
}
