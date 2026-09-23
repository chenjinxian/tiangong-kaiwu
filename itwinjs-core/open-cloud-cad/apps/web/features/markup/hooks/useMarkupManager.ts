/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Markup Manager Hook
 * Manages markup sessions, tools, and persistence
 * Simplified version without @itwin/core-markup dependency
 */

import { useCallback, useEffect, useState } from 'react';
import { IModelApp } from '@itwin/core-frontend';

export type MarkupToolType =
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'arrow'
  | 'cloud'
  | 'polygon'
  | 'sketch'
  | 'text'
  | 'distance'
  | 'symbol';

export interface MarkupData {
  svg: string;
  decorations: unknown[];
}

export interface MarkupSession {
  id: string;
  name: string;
  author: string;
  createdAt: number;
  updatedAt: number;
  data: MarkupData;
  isActive: boolean;
  iModelId?: string;
}

export interface UseMarkupManagerOptions {
  viewport: unknown | null;
  iModelId?: string;
  currentUser?: string;
}

export interface UseMarkupManagerReturn {
  // State
  activeSession: MarkupSession | null;
  sessions: MarkupSession[];
  activeTool: MarkupToolType | null;
  isLoading: boolean;
  error: Error | null;

  // Actions
  startSession: (name: string) => Promise<void>;
  stopSession: () => void;
  runTool: (tool: MarkupToolType) => Promise<void>;
  loadSession: (session: MarkupSession) => Promise<void>;
  deleteSession: (id: string) => void;
  saveSession: () => Promise<void>;
  exportSvg: () => string;
  updateSessionName: (id: string, newName: string) => void;

  // Status
  isActive: boolean;
}

export function useMarkupManager(options: UseMarkupManagerOptions): UseMarkupManagerReturn {
  const { iModelId, currentUser = 'Anonymous' } = options;

  const [activeSession, setActiveSession] = useState<MarkupSession | null>(null);
  const [sessions, setSessions] = useState<MarkupSession[]>([]);
  const [activeTool, setActiveTool] = useState<MarkupToolType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Load sessions from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`open-cloud-cad-markups-${iModelId || 'global'}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed.sessions || []);
      } catch (err) {
        console.warn('[Markup] Failed to parse saved sessions:', err);
      }
    }
  }, [iModelId]);

  // Save to localStorage when sessions change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(
        `open-cloud-cad-markups-${iModelId || 'global'}`,
        JSON.stringify({ sessions })
      );
    }
  }, [sessions, iModelId]);

  // Start new markup session
  const startSession = useCallback(async (name: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Stop any existing session first
      if (activeSession) {
        stopSession();
      }

      // Note: MarkupApp is not available in current iTwin.js version
      // Using simplified implementation
      const newSession: MarkupSession = {
        id: `markup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: name || `标记 ${new Date().toLocaleTimeString()}`,
        author: currentUser,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: { svg: '', decorations: [] },
        isActive: true,
        iModelId,
      };

      setActiveSession(newSession);
      setSessions((prev) => [newSession, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to start markup session'));
    } finally {
      setIsLoading(false);
    }
  }, [activeSession, currentUser, iModelId]);

  // Stop current session
  const stopSession = useCallback(() => {
    if (!activeSession) return;

    try {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? { ...s, isActive: false, updatedAt: Date.now() }
            : s
        )
      );

      setActiveSession(null);
      setActiveTool(null);
    } catch (err) {
      console.error('[Markup] Error stopping session:', err);
    }
  }, [activeSession]);

  // Run a markup tool
  const runTool = useCallback(async (tool: MarkupToolType) => {
    if (!activeSession) {
      await startSession(`标记 ${new Date().toLocaleTimeString()}`);
    }

    const toolMap: Record<MarkupToolType, string> = {
      line: 'Markup.Line',
      rectangle: 'Markup.Rectangle',
      circle: 'Markup.Circle',
      ellipse: 'Markup.Ellipse',
      arrow: 'Markup.Arrow',
      cloud: 'Markup.Cloud',
      polygon: 'Markup.Polygon',
      sketch: 'Markup.Sketch',
      text: 'Markup.Text.Place',
      distance: 'Markup.Distance',
      symbol: 'Markup.Symbol',
    };

    try {
      const success = await IModelApp.tools.run(toolMap[tool]);
      if (success) {
        setActiveTool(tool);
      }
    } catch (err) {
      console.warn('[Markup] Tool not available:', tool);
    }
  }, [activeSession, startSession]);

  // Load a saved session
  const loadSession = useCallback(async (session: MarkupSession) => {
    setIsLoading(true);

    try {
      // Stop current session
      if (activeSession) {
        stopSession();
      }

      setActiveSession({ ...session, isActive: true });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load session'));
    } finally {
      setIsLoading(false);
    }
  }, [activeSession, stopSession]);

  // Delete a session
  const deleteSession = useCallback((id: string) => {
    if (activeSession?.id === id) {
      stopSession();
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }, [activeSession, stopSession]);

  // Save current session to backend
  const saveSession = useCallback(async () => {
    if (!activeSession) return;

    // Update local state
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? { ...s, updatedAt: Date.now() }
          : s
      )
    );

    // Save to backend
    if (iModelId) {
      try {
        await fetch(`/api/imodels/${iModelId}/markups`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: activeSession.id,
            name: activeSession.name,
          }),
        });
      } catch (err) {
        console.error('[Markup] Failed to save to backend:', err);
      }
    }
  }, [activeSession, iModelId]);

  // Export current SVG
  const exportSvg = useCallback(() => {
    if (!activeSession) return '';
    return activeSession.data.svg || '';
  }, [activeSession]);

  // Update session name
  const updateSessionName = useCallback((id: string, newName: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, name: newName, updatedAt: Date.now() } : s
      )
    );

    if (activeSession?.id === id) {
      setActiveSession((prev) => (prev ? { ...prev, name: newName } : null));
    }
  }, [activeSession]);

  return {
    activeSession,
    sessions,
    activeTool,
    isLoading,
    error,
    startSession,
    stopSession,
    runTool,
    loadSession,
    deleteSession,
    saveSession,
    exportSvg,
    updateSessionName,
    isActive: !!activeSession?.isActive,
  };
}
