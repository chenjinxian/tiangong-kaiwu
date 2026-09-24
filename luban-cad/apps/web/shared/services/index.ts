/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Services barrel export
 */

// ============================================================================
// SDK Clients (Official iTwin Platform SDKs)
// ============================================================================

// Briefcase Client (Custom LubanCAD API)
export * from './briefcases/index.js';

// Auth Client (REST API compatible)
export {
  getAccessToken,
  isAuthenticated,
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  signIn,
  signOut,
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  handleSigninCallback,
} from '../../features/auth/services/auth/client.js';

// iTwins Client (@itwin/itwins-client)
export {
  iTwinsClient,
  ITwinSubClass,
  getAuthorization as getITwinsAuthorization,
} from './itwins/client.js';
export type {
  ITwin,
} from './itwins/client.js';

// iModels Clients (@itwin/imodels-client-management)
export {
  iModelsManagementClient,
  getAuthorization as getIModelsAuthorization,
} from './imodels/client.js';
export type {
  IModel,
  Briefcase,
  Changeset,
  NamedVersion,
} from './imodels/client.js';

// Access Control Client (@itwin/access-control-client)
export {
  accessControlClient,
  getAuthorization as getAccessControlAuthorization,
} from './accessControl/client.js';
export type {
  Member,
  Role,
  Permission,
} from './accessControl/client.js';

// Webhooks Client (@itwin/webhooks-client)
export {
  webhooksClient,
  getAuthorization as getWebhooksAuthorization,
} from './webhooks/client.js';
export type {
  Webhook,
  WebhookEvent,
  WebhookEventType,
} from './webhooks/client.js';

