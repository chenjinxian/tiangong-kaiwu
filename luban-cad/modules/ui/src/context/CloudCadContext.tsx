/**-----------------------------
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import React, { createContext, useEffect, useState } from "react";

// Stub types until core package exports them
// eslint-disable-next-line @typescript-eslint/naming-convention
const CloudCadApp = {
  initialized: false,
};

const initializeCloudCad = async (): Promise<void> => {
  CloudCadApp.initialized = true;
};

/**
 * Context value type
 * @public
 */
export interface CloudCadContextValue {
  /** CloudCadApp instance */
   
  app: typeof CloudCadApp;
  /** Whether the app is initialized */
  isInitialized: boolean;
}

/**
 * React context for CloudCadApp
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const CloudCadContext = createContext<CloudCadContextValue | null>(null);

/**
 * Props for CloudCadProvider
 * @public
 */
export interface CloudCadProviderProps {
  /** Child components */
  children: React.ReactNode;
}

/**
 * Provider component for CloudCadApp
 * @public
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const CloudCadProvider: React.FC<CloudCadProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        if (!CloudCadApp.initialized) {
          await initializeCloudCad();
        }
        setIsInitialized(true);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to initialize CloudCadApp:", error);
      }
    };

    void init();
  }, []);

  return (
    <CloudCadContext.Provider value={{ app: CloudCadApp, isInitialized }}>
      {children}
    </CloudCadContext.Provider>
  );
};
