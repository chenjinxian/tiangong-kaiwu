/**-----------------------------
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { useContext } from "react";
import { CloudCadContext } from "../context/CloudCadContext.js";

/**
 * Hook to access CloudCadApp instance from context
 * @public
 */
export const useCloudCad = () => {
  const context = useContext(CloudCadContext);
  if (!context) {
    throw new Error("useCloudCad must be used within a CloudCadProvider");
  }
  return context;
};
