/**
 * Copyright (c) Open Cloud CAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * iModels Clients - Using @itwin/imodels-client-management
 */

import { IModelsClient as ManagementClient } from '@itwin/imodels-client-management';
import { getValidAccessToken } from '../../../features/auth/services/auth/client.js';

const BACKEND_URL = import.meta.env.VITE_IMODELHUB_URL || '';

/**
 * Authorization callback for SDK operations
 * Returns Bearer token format required by SDK
 */
export async function getAuthorization() {
  const token = await getValidAccessToken();
  if (!token) {
    throw new Error('Not authenticated - please log in again');
  }
  return {
    scheme: 'Bearer' as const,
    token,
  };
}

/**
 * iModels Management Client
 * For querying iModels, briefcases, changesets metadata
 */
export const iModelsManagementClient = new ManagementClient({
  api: {
    baseUrl: `${BACKEND_URL}/imodels`,
  },
});

/**
 * Re-export SDK types
 */
export type {
  IModel,
  Briefcase,
  Changeset,
  NamedVersion,
} from '@itwin/imodels-client-management';
