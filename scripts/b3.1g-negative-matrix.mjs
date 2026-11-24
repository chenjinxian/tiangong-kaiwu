#!/usr/bin/env node
/**
 * G1 B3.1g negative-matrix harness (2026-11-24).
 *
 * One checked-in definition of the negative authorization matrix across:
 *   - Hub routes (RBAC roles, outsider, anonymous, signed service scope,
 *     legacy API-key-only, cross-iTwin child IDs);
 *   - modeling-server read/write/dangerous surfaces (session, foreign file,
 *     read-only, deny, 503);
 *   - BFF denial preservation;
 *   - webhook-agent baseline/webhook/debug surfaces;
 *   - storage/tile anonymous surfaces where applicable.
 *
 * Modes:
 *   --check  (default) static matrix validation. No network, no secrets.
 *            Optionally runs the referenced unit tests with --run-tests.
 *   --probe  executes HTTP probes from an explicit --probe-config JSON file.
 *            Probe mode is the only mode that can require tokens/secrets.
 *
 * The report is machine-readable (--format json) or Markdown (--format
 * markdown) and contains, per cell: expected outcome, coverage kind
 * (automated/manual/unproven), status (pass/fail/unproven), evidence test
 * references, and — in probe mode — the exact request URL/method and the
 * observed response status plus a redacted body snippet.
 *
 * This script never reads `.env` files and never prints a credential. Unit
 * tests it runs use fake servers and fixture secrets defined inside the tests.
 *
 * Usage:
 *   node scripts/b3.1g-negative-matrix.mjs --check
 *   node scripts/b3.1g-negative-matrix.mjs --check --run-tests
 *   node scripts/b3.1g-negative-matrix.mjs --check --run-tests --format json
 *   node scripts/b3.1g-negative-matrix.mjs --probe --probe-config b31g.probe.json --allow-mutations
 *
 * Repo roots default to sibling checkouts and can be overridden with
 * --ms-root/--hub-root/--wa-root/--bff-root or B31G_MS_ROOT/B31G_HUB_ROOT/
 * B31G_WA_ROOT/B31G_BFF_ROOT. A missing private-repo root is reported as
 * "reference unverified" (warning), never a fabricated pass.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCHEMA_VERSION = 1;
const REQUIRED_SURFACES = ['hub', 'ms', 'bff', 'wa', 'storage', 'tile'];
const REQUIRED_PRINCIPALS = [
  'admin',
  'editor',
  'viewer',
  'readonly',
  'outsider',
  'anonymous',
  'service',
  'api-key-only',
];

const ev = (repo, file, test) => ({ repo, file, test });

const HUB_AUTHZ = 'test/unit/authorization/authorization.service.spec.ts';
const HUB_RESOURCE_GUARD = 'test/unit/authorization/resource-access.guard.spec.ts';
const HUB_AGENT_GUARD = 'test/unit/authorization/system-agent-or-resource.guard.spec.ts';
const HUB_SERVICE_GUARD = 'test/unit/service-identity/data-plane-auth.guard.spec.ts';
const HUB_API_KEY_GUARD = 'test/unit/guards/api-key.guards.spec.ts';
const HUB_PEP_ROUTES = 'test/unit/authorization/pep-route-metadata.spec.ts';
const HUB_NEGATIVE = 'test/unit/authorization/b31g-negative-matrix.spec.ts';
const HUB_PARENT_BINDING = 'test/unit/access-control/access-control-parent-binding.spec.ts';
const HUB_IMAGE_DELETE = 'test/unit/itwins/itwin-image-delete.spec.ts';
const HUB_IMAGE_UPLOAD = 'test/unit/itwins/itwin-image-upload.spec.ts';
const HUB_FAVORITES = 'test/unit/itwins/itwin-favorites-acl.spec.ts';

const MS_READ_GATE = 'src/authz/readAccessGate.test.ts';
const MS_WRITE_GATE = 'src/authz/writeAccessGate.test.ts';
const MS_FEATURE_READ = 'src/feature/FeatureRpcImpl.readEnforce.test.ts';
const MS_FEATURE_WRITE = 'src/feature/FeatureRpcImpl.writeEnforce.test.ts';
const MS_EXPORT = 'src/rpc/LubanRpcImpl.surfacesEnforce.test.ts';
const MS_PROGRESS = 'src/routes/progress.test.ts';
const MS_RETRY = 'src/routes/retryRoute.test.ts';
const MS_BRIEFCASE_FILES = 'src/session/BriefcaseFiles.test.ts';
const MS_PATH_GUARD = 'src/session/PathGuard.test.ts';
const MS_FAKE_HUB = 'src/authz/b31gNegativeMatrix.test.ts';

const BFF_DENIAL = 'test/denial-preservation.test.ts';
const BFF_APP = 'test/app.test.ts';
const WA_SERVER = 'src/webhook-server.test.ts';

/**
 * @typedef {object} Cell
 * @property {string} id
 * @property {'hub'|'ms'|'bff'|'storage'|'tile'|'wa'} surface
 * @property {string} route
 * @property {string} principal
 * @property {number|string} expected
 * @property {'automated'|'manual'|'unproven'} coverage
 * @property {Array<{repo:string,file:string,test:string}>} [evidence]
 * @property {string} [manualReason]
 * @property {string} [reason]
 * @property {string} [note]
 * @property {'direct'|'composition'} [evidenceKind]
 * @property {object} [probe]
 */

/** @type {Cell[]} */
const MATRIX = [
  // ---------------------------------------------------------------------------
  // HUB: user RBAC (Admin/Editor/Viewer/outsider/read-only/anonymous)
  // ---------------------------------------------------------------------------
  {
    id: 'hub.rbac.itwin.read.admin',
    surface: 'hub',
    route: 'GET /itwins/:id',
    principal: 'admin',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should grant all permissions to owner member'),
      ev('hub', HUB_RESOURCE_GUARD, 'should check access with itwinParam'),
    ],
    probe: { method: 'GET', path: '/itwins/{itwinA}', expect: [200] },
    note: 'Owner/Admin holds itwins_webview; the route guard delegates to the single resolver.',
  },
  {
    id: 'hub.rbac.itwin.read.viewer',
    surface: 'hub',
    route: 'GET /itwins/:id',
    principal: 'viewer',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should default member without roles to viewer permissions'),
      ev('hub', HUB_RESOURCE_GUARD, 'should check access with itwinParam'),
    ],
    probe: { method: 'GET', path: '/itwins/{itwinA}', expect: [200] },
  },
  {
    id: 'hub.rbac.itwin.read.readonly',
    surface: 'hub',
    route: 'GET /itwins/:id (viewer or explicit iModel Read)',
    principal: 'readonly',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should default member without roles to viewer permissions'),
      ev('hub', HUB_RESOURCE_GUARD, 'should check access with itwinParam'),
    ],
    probe: { method: 'GET', path: '/itwins/{itwinA}', expect: [200] },
    note: 'Read-only *iTwin member* (webview). A user holding only an explicit iModel Read is not an iTwin member and would get 403 on this metadata route; the explicit-Read cells are under /imodels.',
  },
  {
    id: 'hub.rbac.itwin.read.outsider',
    surface: 'hub',
    route: 'GET /itwins/:id',
    principal: 'outsider',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should return empty for stranger'),
      ev('hub', HUB_AUTHZ, 'should throw ForbiddenException on checkAccess failure'),
    ],
    probe: { method: 'GET', path: '/itwins/{itwinA}', expect: [403] },
  },
  {
    id: 'hub.rbac.itwin.read.anonymous',
    surface: 'hub',
    route: 'GET /itwins/:id',
    principal: 'anonymous',
    expected: 401,
    coverage: 'manual',
    manualReason: 'Route-level passport JWT guard is exercised only by a live Hub request; no unit test mounts the real strategy.',
    probe: { method: 'GET', path: '/itwins/{itwinA}', expect: [401] },
  },
  {
    id: 'hub.rbac.itwin.write.admin',
    surface: 'hub',
    route: 'PATCH /itwins/:id',
    principal: 'admin',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should grant all permissions to owner member'),
      ev('hub', HUB_RESOURCE_GUARD, 'should check access with itwinParam'),
    ],
    probe: { method: 'PATCH', path: '/itwins/{itwinA}', expect: [200], mutation: true },
  },
  {
    id: 'hub.rbac.itwin.write.editor',
    surface: 'hub',
    route: 'PATCH /itwins/:id',
    principal: 'editor',
    expected: 403,
    coverage: 'manual',
    manualReason: 'The seeded Editor role excludes itwins_modify; proving it needs a live Hub with seeded roles. Unit resolver tests use synthetic roles.',
    probe: { method: 'PATCH', path: '/itwins/{itwinA}', expect: [403], mutation: true },
  },
  {
    id: 'hub.rbac.itwin.write.viewer',
    surface: 'hub',
    route: 'PATCH /itwins/:id',
    principal: 'viewer',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should default member without roles to viewer permissions'),
      ev('hub', HUB_AUTHZ, 'should throw ForbiddenException on checkAccess failure'),
    ],
    probe: { method: 'PATCH', path: '/itwins/{itwinA}', expect: [403], mutation: true },
  },
  {
    id: 'hub.rbac.imodel.read.viewer',
    surface: 'hub',
    route: 'GET /imodels/:id',
    principal: 'viewer',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should delegate to iTwin RBAC when isSecured=false (zero drift)'),
      ev('hub', HUB_RESOURCE_GUARD, 'should delegate iModelParam to checkIModelAccess (iTwin RBAC / isSecured ACL)'),
    ],
    probe: { method: 'GET', path: '/imodels/{iModelA}', expect: [200] },
  },
  {
    id: 'hub.rbac.imodel.read.readonly-secured',
    surface: 'hub',
    route: 'GET /imodels/:id (isSecured=true)',
    principal: 'readonly',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_AUTHZ, 'should allow read with an explicit Read level')],
    probe: { method: 'GET', path: '/imodels/{iModelA}', expect: [200] },
    note: 'Only valid when the iModel is secured and the test principal has an explicit Read row.',
  },
  {
    id: 'hub.rbac.imodel.read.outsider',
    surface: 'hub',
    route: 'GET /imodels/:id (isSecured=true)',
    principal: 'outsider',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should deny an iTwin member without an explicit iModel permission'),
      ev('hub', HUB_AUTHZ, 'should return empty for stranger'),
    ],
    probe: { method: 'GET', path: '/imodels/{iModelA}', expect: [403] },
    note: 'Secured iModel: no explicit Read row is a deny; the outsider also has no iTwin RBAC. Composition of the two resolver tests.',
  },
  {
    id: 'hub.rbac.imodel.write.editor',
    surface: 'hub',
    route: 'PATCH /imodels/:id',
    principal: 'editor',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should let iTwin imodels_manage holders bypass the secured ACL'),
      ev('hub', HUB_RESOURCE_GUARD, 'should delegate iModelParam to checkIModelAccess (iTwin RBAC / isSecured ACL)'),
    ],
    probe: { method: 'PATCH', path: '/imodels/{iModelA}', expect: [200], mutation: true },
  },
  {
    id: 'hub.rbac.imodel.write.viewer',
    surface: 'hub',
    route: 'PATCH /imodels/:id',
    principal: 'viewer',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should deny manage with only Read explicit permission'),
      ev('hub', HUB_AUTHZ, 'should default member without roles to viewer permissions'),
    ],
    probe: { method: 'PATCH', path: '/imodels/{iModelA}', expect: [403], mutation: true },
  },
  {
    id: 'hub.rbac.changesets.read.viewer',
    surface: 'hub',
    route: 'GET /imodels/:id/changesets',
    principal: 'viewer',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_AUTHZ, 'should allow a changeSETS Read grant on a changesets content route (F5)')],
    probe: { method: 'GET', path: '/imodels/{iModelA}/changesets', expect: [200] },
  },
  {
    id: 'hub.rbac.changesets.write.viewer',
    surface: 'hub',
    route: 'POST /imodels/:id/changesets',
    principal: 'viewer',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'composition',
    evidence: [
      ev('hub', HUB_AUTHZ, 'should default member without roles to viewer permissions'),
      ev('hub', HUB_AUTHZ, 'should deny manage with only Read explicit permission'),
    ],
    probe: { method: 'POST', path: '/imodels/{iModelA}/changesets', expect: [403], mutation: true },
  },

  // ---------------------------------------------------------------------------
  // HUB: signed service scope, legacy API-key-only, anonymous key routes
  // ---------------------------------------------------------------------------
  {
    id: 'hub.service.user-route',
    surface: 'hub',
    route: 'GET /itwins/:id',
    principal: 'service',
    expected: '401 (no user JWT) / 403 (defense in depth)',
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('hub', HUB_NEGATIVE, 'should reject a signed service principal on GET /itwins/:id with 403 before RBAC'),
      ev('hub', HUB_SERVICE_GUARD, 'should fail closed when a token is presented on a route without data-plane metadata'),
    ],
    probe: { method: 'GET', path: '/itwins/{itwinA}', expect: [401, 403], principalHeader: 'service' },
    note: 'DataPlaneAuthGuard rejects the token (401) before routing; ResourceAccessGuard is defense in depth (403).',
  },
  {
    id: 'hub.service.data-scope.match',
    surface: 'hub',
    route: 'GET /imodels/:id/changesets',
    principal: 'service',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('hub', HUB_SERVICE_GUARD, 'should accept a signed token from an allowed service on a data-plane route'),
      ev('hub', HUB_AGENT_GUARD, 'should allow a service principal with the explicit route scope and never consult RBAC'),
    ],
    probe: { method: 'GET', path: '/imodels/{iModelA}/changesets', expect: [200], principalHeader: 'service' },
    note: 'Scope-only by design: the route does not bind the principal to one iTwin/iModel. Accepted risk, not an ACL cell.',
  },
  {
    id: 'hub.service.data-scope.missing',
    surface: 'hub',
    route: 'GET /imodels/:id/changesets',
    principal: 'service',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('hub', HUB_SERVICE_GUARD, 'should reject a valid pinned service whose token lacks the route scope'),
      ev('hub', HUB_AGENT_GUARD, 'should reject a service principal that lacks the route scope'),
    ],
    probe: { method: 'GET', path: '/imodels/{iModelA}/changesets', expect: [403], principalHeader: 'serviceNoScope' },
  },
  {
    id: 'hub.service.data-scope.foreign-imodel',
    surface: 'hub',
    route: 'GET /imodels/:id/changesets in another iTwin',
    principal: 'service',
    expected: 200,
    coverage: 'manual',
    manualReason: 'By design today: a data-plane scope is service-wide and not bound to one iModel. Needs a live probe plus a product decision; do not read as an ACL pass.',
    probe: { method: 'GET', path: '/imodels/{iModelB}/changesets', expect: [200], principalHeader: 'service' },
    note: 'Known accepted risk: service principals are scope-only, not resource-bound.',
  },
  {
    id: 'hub.apikey.with-user.off',
    surface: 'hub',
    route: 'GET /imodels/:id/changesets (AUTHZ_ENFORCE=off)',
    principal: 'api-key+user',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_AGENT_GUARD, 'should allow a valid X-API-Key as system actor without checking RBAC')],
    probe: { method: 'GET', path: '/imodels/{iModelA}/changesets', expect: [200], principalHeader: 'serviceAccountWithKey' },
    note: 'Legacy: shared key + a user JWT (service-account) bypasses RBAC in off mode on a content route that mounts SystemAgentOrResourceGuard. Enforce modes must not keep this bypass. A key-only request never reaches this branch: the class JWT guard returns 401 first.',
  },
  {
    id: 'hub.apikey.key-only.content-route',
    surface: 'hub',
    route: 'GET /imodels/:id/changesets (any AUTHZ_ENFORCE mode)',
    principal: 'api-key-only',
    expected: 401,
    coverage: 'manual',
    manualReason: 'The class DataPlaneAuthGuard (passport JWT) rejects a request with no Authorization before RBAC; no route-level unit test mounts the full guard stack.',
    probe: { method: 'GET', path: '/imodels/{iModelA}/changesets', expect: [401], principalHeader: 'apiKeyOnly' },
    note: 'Key-only is not an identity on an official content route. The 401 comes from authentication, not from the B3.1e RBAC branch.',
  },
  {
    id: 'hub.apikey.content-route.read',
    surface: 'hub',
    route: 'GET /imodels/:id/changesets (AUTHZ_ENFORCE=read)',
    principal: 'api-key-only',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_AGENT_GUARD, 'should reject a key-only GET with 401 before RBAC in read mode')],
    probe: { method: 'GET', path: '/imodels/{iModelA}/changesets', expect: [401], principalHeader: 'apiKeyOnly', env: 'AUTHZ_ENFORCE=read' },
    note: 'Unit evidence is the B3.1e guard branch; in production the class JWT guard may return the same 401 earlier. Status is stable, layer differs.',
  },
  {
    id: 'hub.apikey.content-route.write',
    surface: 'hub',
    route: 'POST /imodels/:id/changesets (AUTHZ_ENFORCE=write)',
    principal: 'api-key-only',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_AGENT_GUARD, 'should reject a key-only POST with 401 in write mode')],
    probe: { method: 'POST', path: '/imodels/{iModelA}/changesets', expect: [401], principalHeader: 'apiKeyOnly', env: 'AUTHZ_ENFORCE=write', mutation: true },
    note: 'Same layer caveat as the read-mode key-only cell: the final status is 401 either way.',
  },
  {
    id: 'hub.apikey.with-user.outsider.write',
    surface: 'hub',
    route: 'POST /imodels/:id/changesets (AUTHZ_ENFORCE=write)',
    principal: 'outsider',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_AGENT_GUARD, 'should apply RBAC to POST in write mode when a user is present')],
    probe: { method: 'POST', path: '/imodels/{iModelA}/changesets', expect: [403], principalHeader: 'outsiderWithKey', env: 'AUTHZ_ENFORCE=write', mutation: true },
  },
  {
    id: 'hub.apikey.admin-route.anonymous',
    surface: 'hub',
    route: 'GET /imodels/admin/uninitialized',
    principal: 'anonymous',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_API_KEY_GUARD, 'should reject missing and unconfigured keys')],
    probe: { method: 'GET', path: '/imodels/admin/uninitialized', expect: [401] },
  },
  {
    id: 'hub.apikey.baseline.anonymous',
    surface: 'hub',
    route: 'POST /imodels/:id/baselinefile/requeue',
    principal: 'anonymous',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_API_KEY_GUARD, 'should reject missing and unconfigured keys')],
    probe: { method: 'POST', path: '/imodels/{iModelA}/baselinefile/requeue', expect: [401], mutation: true },
  },

  // ---------------------------------------------------------------------------
  // HUB: cross-iTwin child resources (IDOR)
  // ---------------------------------------------------------------------------
  {
    id: 'hub.crossitwin.accesscontrol.role',
    surface: 'hub',
    route: 'GET /accesscontrol/itwins/A/roles/{roleOfB}',
    principal: 'cross-itwin',
    expected: 404,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_PARENT_BINDING, 'should bind roles to the path iTwin')],
    probe: { method: 'GET', path: '/accesscontrol/itwins/{itwinA}/roles/{roleOfB}', expect: [404], principalHeader: 'adminA' },
  },
  {
    id: 'hub.crossitwin.accesscontrol.group',
    surface: 'hub',
    route: 'GET /accesscontrol/itwins/A/groups/{groupOfB}',
    principal: 'cross-itwin',
    expected: 404,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_PARENT_BINDING, 'should bind groups and group-member routes to the path iTwin')],
    probe: { method: 'GET', path: '/accesscontrol/itwins/{itwinA}/groups/{groupOfB}', expect: [404], principalHeader: 'adminA' },
  },
  {
    id: 'hub.crossitwin.accesscontrol.job',
    surface: 'hub',
    route: 'GET /accesscontrol/itwins/A/jobs/{jobOfB}',
    principal: 'cross-itwin',
    expected: 404,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_PARENT_BINDING, 'should bind jobs and job actions to the path iTwin')],
    probe: { method: 'GET', path: '/accesscontrol/itwins/{itwinA}/jobs/{jobOfB}', expect: [404], principalHeader: 'adminA' },
  },
  {
    id: 'hub.crossitwin.image.delete',
    surface: 'hub',
    route: 'DELETE /itwins/A/image/{imageOfB}',
    principal: 'cross-itwin',
    expected: 404,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_IMAGE_DELETE, 'should 404 and not delete an image owned by another iTwin')],
    probe: { method: 'DELETE', path: '/itwins/{itwinA}/image/{imageOfB}', expect: [404], principalHeader: 'adminA', mutation: true },
  },
  {
    id: 'hub.crossitwin.image.content',
    surface: 'hub',
    route: 'GET /itwins/A/image/{imageOfB}/content',
    principal: 'cross-itwin',
    expected: 404,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_IMAGE_UPLOAD, 'should 404 content from another iTwin')],
    probe: { method: 'GET', path: '/itwins/{itwinA}/image/{imageOfB}/content', expect: [404], principalHeader: 'adminA' },
  },
  {
    id: 'hub.favorites.write.viewer',
    surface: 'hub',
    route: 'POST /itwins/favorites/:id',
    principal: 'viewer',
    expected: 204,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_FAVORITES, 'should allow favoriting an iTwin with webview')],
    probe: { method: 'POST', path: '/itwins/favorites/{itwinA}', expect: [204], principalHeader: 'viewer', mutation: true },
  },
  {
    id: 'hub.favorites.write.outsider',
    surface: 'hub',
    route: 'POST /itwins/favorites/:id',
    principal: 'outsider',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_FAVORITES, 'should reject favoriting/recenting an iTwin without webview')],
    probe: { method: 'POST', path: '/itwins/favorites/{itwinA}', expect: [403], principalHeader: 'outsider', mutation: true },
  },
  {
    id: 'hub.favorites.list.visibility',
    surface: 'hub',
    route: 'GET /itwins/favorites',
    principal: 'viewer',
    expected: '200 with only visible iTwins',
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('hub', HUB_FAVORITES, 'should filter favorites through the resolver')],
    probe: { method: 'GET', path: '/itwins/favorites', expect: [200], principalHeader: 'viewer' },
  },
  {
    id: 'hub.pep.route-coverage',
    surface: 'hub',
    route: 'all selected content controllers',
    principal: 'system',
    expected: 'metadata + ACL guard on every route, or registered exception',
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('hub', HUB_PEP_ROUTES, 'should require metadata or a registered exception for every route handler'),
      ev('hub', HUB_PEP_ROUTES, 'should require an ACL guard on every metadata-bearing route'),
    ],
  },

  // ---------------------------------------------------------------------------
  // MODELING-SERVER: read/write/dangerous surfaces
  // ---------------------------------------------------------------------------
  {
    id: 'ms.read.missing-session',
    surface: 'ms',
    route: 'FeatureOp read / download / open',
    principal: 'anonymous',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('ms', MS_READ_GATE, 'fails closed without a session'),
      ev('ms', MS_FAKE_HUB, 'missing session: 403 before any Hub call'),
    ],
    note: 'IPC, not HTTP: no token means no session; the gate never guesses an identity.',
  },
  {
    id: 'ms.read.foreign-file.session',
    surface: 'ms',
    route: 'briefcase file in another session directory',
    principal: 'outsider',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('ms', MS_BRIEFCASE_FILES, "rejects session B on session A's file (covers open/_findDb/ESV/camera entries)"),
      ev('ms', MS_FAKE_HUB, 'foreign file: another session cannot read or write it (403 SessionOwnership)'),
    ],
    note: 'SessionOwnership 403; the check runs before any Hub decision.',
  },
  {
    id: 'ms.read.foreign-file.outside-root',
    surface: 'ms',
    route: 'client-supplied path outside the briefcase cache root',
    principal: 'outsider',
    expected: 400,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('ms', MS_PATH_GUARD, 'rejects absolute paths outside the cache root')],
    note: 'InvalidPath 400. Path rejection is a request-shape error, not an ACL decision.',
  },
  {
    id: 'ms.read.readonly-rw',
    surface: 'ms',
    route: 'downloadBriefcase (writable)',
    principal: 'readonly',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('ms', MS_READ_GATE, 'denies a read-only user who requests a writable download'),
      ev('ms', MS_FAKE_HUB, 'read-only user: writable download is denied 403'),
    ],
  },
  {
    id: 'ms.read.readonly-ok',
    surface: 'ms',
    route: 'downloadBriefcase (readonly)',
    principal: 'readonly',
    expected: 'allowed',
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('ms', MS_READ_GATE, 'does not require briefcase.write for a read-only request'),
      ev('ms', MS_FAKE_HUB, 'read-only user: read-only download is allowed by the same Hub'),
    ],
  },
  {
    id: 'ms.read.deny',
    surface: 'ms',
    route: 'FeatureOp read / listPartStudios',
    principal: 'outsider',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('ms', MS_FEATURE_READ, 'denies before service initialization and model content'),
      ev('ms', MS_FAKE_HUB, 'explicit policy deny: 403'),
    ],
  },
  {
    id: 'ms.read.unavailable',
    surface: 'ms',
    route: 'FeatureOp read',
    principal: 'outsider',
    expected: 503,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('ms', MS_FEATURE_READ, 'fails closed when the decision service is unavailable'),
      ev('ms', MS_FAKE_HUB, 'Hub decision unavailable: 503 AuthorizationUnavailable'),
    ],
  },
  {
    id: 'ms.write.deny',
    surface: 'ms',
    route: 'applyFeatureOp',
    principal: 'outsider',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('ms', MS_FEATURE_WRITE, 'denies applyFeatureOp before the legacy-scope query, service init and mutation')],
  },
  {
    id: 'ms.write.readonly-push',
    surface: 'ms',
    route: 'ipc-app.pushChanges',
    principal: 'readonly',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('ms', MS_WRITE_GATE, 'denies the whole push when changeset.push is denied even if doc.write allows'),
      ev('ms', MS_FAKE_HUB, 'write deny: 403 before any write-side effect'),
    ],
  },
  {
    id: 'ms.write.unavailable',
    surface: 'ms',
    route: 'acquireWriteLease / FeatureOp write',
    principal: 'viewer',
    expected: 503,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('ms', MS_WRITE_GATE, 'maps transport/handle failures to AuthorizationUnavailable 503'),
      ev('ms', MS_FEATURE_WRITE, 'fails closed when the decision service is unavailable (no lease created)'),
    ],
  },
  {
    id: 'ms.export.allow',
    surface: 'ms',
    route: 'exportIModel',
    principal: 'viewer',
    expected: 'allowed after doc.read',
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('ms', MS_EXPORT, 'exports after an allowed doc.read decision using the db iTwin/iModel identity')],
  },
  {
    id: 'ms.export.deny',
    surface: 'ms',
    route: 'exportIModel',
    principal: 'outsider',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('ms', MS_EXPORT, 'denies before any export query when the Hub decision denies')],
  },
  {
    id: 'ms.export.unavailable',
    surface: 'ms',
    route: 'exportIModel',
    principal: 'outsider',
    expected: 503,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('ms', MS_EXPORT, 'fails closed with AuthorizationUnavailable when the decision cannot be obtained')],
  },
  {
    id: 'ms.export.missing-session',
    surface: 'ms',
    route: 'exportIModel',
    principal: 'anonymous',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('ms', MS_EXPORT, 'denies without a session (no identity is guessed)')],
  },
  {
    id: 'ms.progress.anonymous',
    surface: 'ms',
    route: 'GET /api/imodels/:id/progress (AUTH_B3_SURFACES_MODE=enforce)',
    principal: 'anonymous',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('ms', MS_PROGRESS, 'keeps authentication precedence: missing token is 401 with no HUB call')],
    probe: { method: 'GET', path: '/api/imodels/{iModelA}/progress', expect: [401] },
  },
  {
    id: 'ms.progress.token',
    surface: 'ms',
    route: 'GET /api/imodels/:id/progress (AUTH_B3_SURFACES_MODE=enforce)',
    principal: 'viewer',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('ms', MS_PROGRESS, 'denies 403 before /auth/me, the progress map and any side effect')],
    probe: { method: 'GET', path: '/api/imodels/{iModelA}/progress', expect: [403], principalHeader: 'viewer' },
  },
  {
    id: 'ms.retry.anonymous',
    surface: 'ms',
    route: 'POST /api/imodels/:id/retry (AUTH_B3_SURFACES_MODE=enforce)',
    principal: 'anonymous',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('ms', MS_RETRY, 'keeps authentication precedence: missing token is 401 with zero HUB calls')],
    probe: { method: 'POST', path: '/api/imodels/{iModelA}/retry', expect: [401], mutation: true },
  },
  {
    id: 'ms.retry.token',
    surface: 'ms',
    route: 'POST /api/imodels/:id/retry (AUTH_B3_SURFACES_MODE=enforce)',
    principal: 'viewer',
    expected: 403,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('ms', MS_RETRY, 'denies 403 before /auth/me, the iTwinId check and the HUB requeue')],
    probe: { method: 'POST', path: '/api/imodels/{iModelA}/retry', expect: [403], principalHeader: 'viewer', mutation: true },
  },

  // ---------------------------------------------------------------------------
  // BFF: authentication and denial preservation
  // ---------------------------------------------------------------------------
  {
    id: 'bff.api.anonymous',
    surface: 'bff',
    route: 'GET /api/*',
    principal: 'anonymous',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('bff', BFF_APP, 'rejects requests without a token: 401, upstream not hit')],
    probe: { method: 'GET', path: '/api/imodels/{iModelA}/progress', expect: [401] },
  },
  {
    id: 'bff.api.invalid-token',
    surface: 'bff',
    route: 'GET /api/*',
    principal: 'anonymous',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('bff', BFF_APP, 'rejects an invalid token: 401, upstream not hit')],
    probe: { method: 'GET', path: '/api/imodels/{iModelA}/progress', expect: [401], principalHeader: 'invalid' },
  },
  {
    id: 'bff.api.ms-403.progress',
    surface: 'bff',
    route: 'GET /api/imodels/:id/progress',
    principal: 'viewer',
    expected: 'MS status/body verbatim, one call, no retry',
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('bff', BFF_DENIAL, 'GET progress: forwards MS 403 code/reason/body verbatim, once, with no success substitution')],
    probe: { method: 'GET', path: '/api/imodels/{iModelA}/progress', expect: [403], principalHeader: 'viewer' },
  },
  {
    id: 'bff.api.ms-403.retry',
    surface: 'bff',
    route: 'POST /api/imodels/:id/retry',
    principal: 'viewer',
    expected: 'MS status/body verbatim, one call, no retry',
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('bff', BFF_DENIAL, 'POST retry: forwards MS 403 verbatim, once, and never retries the HUB-triggering call')],
    probe: { method: 'POST', path: '/api/imodels/{iModelA}/retry', expect: [403], principalHeader: 'viewer', mutation: true },
  },
  {
    id: 'bff.api.ms-401',
    surface: 'bff',
    route: 'GET /api/imodels/:id/progress',
    principal: 'viewer',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('bff', BFF_DENIAL, 'preserves an upstream 401 after BFF token validation, without rewriting it')],
    probe: { method: 'GET', path: '/api/imodels/{iModelA}/progress', expect: [401], principalHeader: 'viewer' },
  },
  {
    id: 'bff.hub-passthrough.anonymous',
    surface: 'bff',
    route: '/itwins (HUB prefix passthrough)',
    principal: 'anonymous',
    expected: '401 from HUB, passed through; BFF is not a PEP for HUB',
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('bff', BFF_APP, 'proxies /itwins to HUB without auth and without path rewrite')],
    probe: { method: 'GET', path: '/itwins/{itwinA}', expect: [401] },
    note: 'Known boundary: the BFF terminates /api JWT only; HUB paths keep the HUB decision.',
  },

  // ---------------------------------------------------------------------------
  // WEBHOOK-AGENT
  // ---------------------------------------------------------------------------
  {
    id: 'wa.baseline.anonymous',
    surface: 'wa',
    route: 'POST /baseline/process',
    principal: 'anonymous',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [
      ev('wa', WA_SERVER, 'does not run baseline processing when the key is missing'),
      ev('wa', WA_SERVER, 'missing key -> 401'),
    ],
    probe: { method: 'POST', path: '/baseline/process', expect: [401], mutation: true },
  },
  {
    id: 'wa.baseline.invalid-key',
    surface: 'wa',
    route: 'POST /baseline/process',
    principal: 'api-key-only',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('wa', WA_SERVER, 'invalid key -> 401 (same generic body)')],
    probe: { method: 'POST', path: '/baseline/process', expect: [401], principalHeader: 'apiKeyOnly', mutation: true },
  },
  {
    id: 'wa.baseline.key-only',
    surface: 'wa',
    route: 'POST /baseline/process',
    principal: 'api-key-only',
    expected: 'accepted with key; handler 400 on incomplete body',
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('wa', WA_SERVER, 'accepts the configured key on all protected routes')],
    probe: { method: 'POST', path: '/baseline/process', expect: [400], principalHeader: 'apiKeyOnly', mutation: true },
    note: 'Shared-key route; body names arbitrary iModel/iTwin. Not job-bound (B3.1f residual).',
  },
  {
    id: 'wa.webhook.events.unsigned',
    surface: 'wa',
    route: 'POST /webhook/events',
    principal: 'anonymous',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('wa', WA_SERVER, 'still rejects /webhook/events without an HMAC signature')],
    probe: { method: 'POST', path: '/webhook/events', expect: [401], mutation: true },
  },
  {
    id: 'wa.webhook.events.signed',
    surface: 'wa',
    route: 'POST /webhook/events',
    principal: 'system',
    expected: 200,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('wa', WA_SERVER, 'still accepts /webhook/events with a valid HMAC signature and no API key')],
    note: 'HMAC proves platform origin, not per-document ACL.',
  },
  {
    id: 'wa.debug.anonymous',
    surface: 'wa',
    route: 'GET /webhook/events/recent',
    principal: 'anonymous',
    expected: 401,
    coverage: 'automated',
    evidenceKind: 'direct',
    evidence: [ev('wa', WA_SERVER, 'missing key -> 401')],
    probe: { method: 'GET', path: '/webhook/events/recent', expect: [401] },
  },
  {
    id: 'wa.baseline.service-scope',
    surface: 'wa',
    route: 'POST /baseline/process',
    principal: 'service',
    expected: 'signed service identity bound to the job (not implemented)',
    coverage: 'unproven',
    reason: 'WA accepts only the shared X-API-Key today; there is no signed service-token path and no iModel/job binding. This is a B3.1f/X-21 residual, not an automated-test gap.',
  },

  // ---------------------------------------------------------------------------
  // STORAGE / TILE (anonymous surfaces)
  // ---------------------------------------------------------------------------
  {
    id: 'storage.nginx.azurite.anonymous',
    surface: 'storage',
    route: 'GET /azurite/<account>/<container>/<blob>',
    principal: 'anonymous',
    expected: 401,
    coverage: 'unproven',
    reason: 'No gateway auth/`auth_request` is implemented in the current compose/nginx path. Public-read is a known gap; run a live probe against an isolated stack before claiming enforcement.',
    probe: { method: 'GET', path: '/azurite/{storageContainer}/{storageBlob}', expect: [401, 403] },
  },
  {
    id: 'storage.sas.replay',
    surface: 'storage',
    route: 'SAS URL outside the session/doc context',
    principal: 'outsider',
    expected: 401,
    coverage: 'unproven',
    reason: 'SAS is a bearer credential with no user/session binding; replay cannot be tested without a live isolated stack and a minted SAS.',
  },
  {
    id: 'tile.public-url.anonymous',
    surface: 'tile',
    route: 'GET tile container/object',
    principal: 'anonymous',
    expected: 401,
    coverage: 'unproven',
    reason: 'Tile URLs are public-url tiles with SAS query today; no auth decision exists in MS/nginx. Needs a live isolated-stack probe plus a rendering/browser check.',
    probe: { method: 'GET', path: '/azurite/{tileContainer}/{tileBlob}', expect: [401, 403] },
  },
];

const REPO_LABELS = {
  public: 'public',
  bff: 'bff',
  ms: 'ms',
  hub: 'hub',
  wa: 'wa',
};

function defaultRoots() {
  return {
    public: REPO_ROOT,
    bff: process.env.B31G_BFF_ROOT || join(REPO_ROOT, 'services', 'bff'),
    ms: process.env.B31G_MS_ROOT || resolve(REPO_ROOT, '..', 'luban-backend', 'modeling-server'),
    hub: process.env.B31G_HUB_ROOT || resolve(REPO_ROOT, '..', 'imodelhub-services'),
    wa: process.env.B31G_WA_ROOT || resolve(REPO_ROOT, '..', 'luban-backend', 'webhook-agent'),
  };
}

function parseArgs(argv) {
  const opts = {
    mode: 'check',
    format: 'markdown',
    runTests: false,
    allowMutations: false,
    probeConfig: undefined,
    out: undefined,
    timeoutMs: 600_000,
    roots: defaultRoots(),
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[i];
    };
    switch (arg) {
      case '--check':
        opts.mode = 'check';
        break;
      case '--probe':
        opts.mode = 'probe';
        break;
      case '--run-tests':
        opts.runTests = true;
        break;
      case '--no-run-tests':
        opts.runTests = false;
        break;
      case '--allow-mutations':
        opts.allowMutations = true;
        break;
      case '--format':
        opts.format = next();
        if (!['json', 'markdown', 'both'].includes(opts.format)) {
          throw new Error('--format must be json, markdown or both');
        }
        break;
      case '--out':
        opts.out = next();
        break;
      case '--probe-config':
        opts.probeConfig = next();
        break;
      case '--timeout-ms':
        opts.timeoutMs = Number(next());
        break;
      case '--ms-root':
        opts.roots.ms = resolve(next());
        break;
      case '--hub-root':
        opts.roots.hub = resolve(next());
        break;
      case '--wa-root':
        opts.roots.wa = resolve(next());
        break;
      case '--bff-root':
        opts.roots.bff = resolve(next());
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function usage() {
  return `B3.1g negative matrix harness

Modes:
  --check                  Static validation; no network, no secrets (default)
  --probe                  Execute probes from --probe-config (may need tokens)

Options:
  --run-tests              Run referenced unit-test files (no secrets)
  --format json|markdown|both
  --out DIR                Write report files; also prints a summary
  --probe-config FILE      JSON: baseUrls, principals.headers, ids
  --allow-mutations        Permit non-GET probes (default: skipped)
  --ms-root/--hub-root/--wa-root/--bff-root PATH
  --timeout-ms N           Per test/probe timeout (default 600000)
  -h, --help
`;
}

function normalizedRepoPath(root, file) {
  return relative(root, file).replace(/\\/g, '/');
}

function gitCommit(root) {
  if (!root || !existsSync(root)) return null;
  const res = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15_000,
  });
  return res.status === 0 ? res.stdout.trim() : null;
}

function environment(opts) {
  const repos = {};
  for (const [key, root] of Object.entries(opts.roots)) {
    repos[key] = {
      label: REPO_LABELS[key] ?? key,
      path: root,
      present: Boolean(root && existsSync(root)),
      commit: gitCommit(root),
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    mode: opts.mode,
    node: process.version,
    platform: process.platform,
    hostname: hostname(),
    runTests: opts.runTests,
    allowMutations: opts.allowMutations,
    probeConfig: opts.probeConfig ? basename(opts.probeConfig) : null,
    repos,
  };
}

function validateMatrix(matrix, roots) {
  const issues = [];
  const warnings = [];
  const ids = new Set();

  for (const cell of matrix) {
    if (!cell.id || IDs_LIKE.test(cell.id) === false) {
      issues.push(`invalid or missing cell id: ${cell.id}`);
      continue;
    }
    if (ids.has(cell.id)) issues.push(`duplicate cell id: ${cell.id}`);
    ids.add(cell.id);
    if (!REQUIRED_SURFACES.includes(cell.surface)) {
      issues.push(`${cell.id}: unknown surface ${cell.surface}`);
    }
    if (!cell.principal) issues.push(`${cell.id}: principal is required`);
    if (cell.expected === undefined || cell.expected === null || cell.expected === '') {
      issues.push(`${cell.id}: expected outcome is required`);
    }
    if (!['automated', 'manual', 'unproven'].includes(cell.coverage)) {
      issues.push(`${cell.id}: coverage must be automated|manual|unproven`);
    }

    if (cell.coverage === 'automated') {
      if (!Array.isArray(cell.evidence) || cell.evidence.length === 0) {
        issues.push(`${cell.id}: automated cell requires evidence`);
      } else {
        for (const evidence of cell.evidence) {
          if (!['hub', 'ms', 'bff', 'wa', 'public'].includes(evidence.repo)) {
            issues.push(`${cell.id}: unknown evidence repo ${evidence.repo}`);
            continue;
          }
          const root = roots[evidence.repo];
          if (!root || !existsSync(root)) {
            warnings.push(`${cell.id}: evidence root ${evidence.repo} is not present; reference not statically verified`);
            continue;
          }
          const file = join(root, evidence.file);
          if (!existsSync(file)) {
            issues.push(`${cell.id}: evidence file missing: ${evidence.repo}:${evidence.file}`);
            continue;
          }
          const text = readFileSync(file, 'utf8');
          if (!text.includes(evidence.test)) {
            issues.push(`${cell.id}: test not found in ${evidence.repo}:${evidence.file}: ${evidence.test}`);
          }
        }
      }
    } else if (cell.coverage === 'manual') {
      if (!cell.manualReason) issues.push(`${cell.id}: manual cell requires manualReason`);
    } else if (!cell.reason) {
      issues.push(`${cell.id}: unproven cell requires reason`);
    }

    if (cell.probe) {
      const probe = cell.probe;
      if (!probe.method || !probe.path || !Array.isArray(probe.expect)) {
        issues.push(`${cell.id}: probe requires method, path and expect[]`);
      }
      if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(probe.method)) {
        issues.push(`${cell.id}: invalid probe method ${probe.method}`);
      }
      if (!cell.probe.surface) probe.surface = cell.surface;
    }
  }

  for (const surface of REQUIRED_SURFACES) {
    if (!matrix.some((cell) => cell.surface === surface)) {
      issues.push(`matrix has no cells for required surface ${surface}`);
    }
  }
  for (const principal of REQUIRED_PRINCIPALS) {
    if (!matrix.some((cell) => cell.principal === principal)) {
      issues.push(`matrix has no cells for required principal ${principal}`);
    }
  }
  return { issues, warnings };
}

const IDs_LIKE = /^[a-z0-9]+(?:\.[a-z0-9-]+)+$/;

function runTestFileSets(cells, roots, timeoutMs) {
  const jobs = new Map();
  for (const cell of cells) {
    if (cell.coverage !== 'automated') continue;
    for (const evidence of cell.evidence ?? []) {
      const key = `${evidence.repo} ${evidence.file}`;
      if (!jobs.has(key)) {
        jobs.set(key, { repo: evidence.repo, file: evidence.file, tests: new Set() });
      }
      jobs.get(key).tests.add(evidence.test);
    }
  }

  const byRepo = new Map();
  for (const job of jobs.values()) {
    if (!byRepo.has(job.repo)) byRepo.set(job.repo, []);
    byRepo.get(job.repo).push(job);
  }

  const results = {};
  for (const [repo, repoJobs] of byRepo) {
    const root = roots[repo];
    if (!root || !existsSync(root)) {
      results[repo] = {
        status: 'skipped',
        reason: `repo root not present: ${root ?? '(unset)'}`,
        files: {},
      };
      continue;
    }
    const isJest = repo === 'hub';
    const bin = isJest
      ? join(root, 'node_modules', 'jest', 'bin', 'jest.js')
      : join(root, 'node_modules', 'vitest', 'vitest.mjs');
    if (!existsSync(bin)) {
      results[repo] = {
        status: 'skipped',
        reason: `test runner not installed: ${bin}`,
        files: {},
      };
      continue;
    }

    const outFile = join(
      mkdtempSync(join(tmpdir(), `b31g-${repo}-`)),
      'results.json',
    );
    const files = repoJobs.map((job) => job.file);
    const args = isJest
      ? [
          bin,
          '--config',
          'test/jest-unit.json',
          '--runInBand',
          '--coverage=false',
          '--json',
          `--outputFile=${outFile}`,
          ...files,
        ]
      : [bin, 'run', '--reporter=json', `--outputFile=${outFile}`, ...files];

    const run = spawnSync(process.execPath, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: timeoutMs,
      env: { ...process.env, CI: 'true', NO_COLOR: '1' },
    });

    const fileResults = {};
    try {
      const report = JSON.parse(readFileSync(outFile, 'utf8'));
      for (const result of report.testResults ?? []) {
        const file = normalizedRepoPath(root, result.name);
        fileResults[file] = {
          status: result.status === 'passed' ? 'passed' : 'failed',
          tests: (result.assertionResults ?? []).map((assertion) => assertion.title ?? assertion.fullName ?? ''),
        };
      }
    } catch (error) {
      fileResults.__parse_error__ = {
        status: 'failed',
        tests: [],
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      rmSync(dirname(outFile), { recursive: true, force: true });
    }

    results[repo] = {
      status: run.status === 0 ? 'passed' : 'failed',
      exitCode: run.status,
      files: fileResults,
      stderr: (run.stderr ?? '').slice(-2000),
    };
  }
  return results;
}

function applyTestResults(cells, testResults) {
  for (const cell of cells) {
    if (cell.coverage !== 'automated') continue;
    const outcomes = (cell.evidence ?? []).map((evidence) => {
      const repo = testResults[evidence.repo];
      if (!repo || repo.status === 'skipped') return 'skipped';
      // `runTestFileSets` keys files by their repo-relative path with forward
      // slashes, which is exactly the checked-in evidence path.
      const result = repo.files[evidence.file];
      if (!result) return 'unknown';
      if (result.status !== 'passed') return 'failed';
      const found = result.tests.some((title) => title.includes(evidence.test) || evidence.test.includes(title));
      return found ? 'passed' : 'test-missing';
    });
    if (outcomes.length === 0) {
      cell.status = 'unproven';
      cell.statusReason = 'no evidence references';
    } else if (outcomes.every((outcome) => outcome === 'passed')) {
      cell.status = 'pass';
      cell.statusReason = 'referenced unit tests passed';
    } else if (outcomes.some((outcome) => outcome === 'failed' || outcome === 'test-missing' || outcome === 'unknown')) {
      cell.status = 'fail';
      cell.statusReason = `evidence outcome: ${outcomes.join(', ')}`;
    } else {
      cell.status = 'unproven';
      cell.statusReason = 'test suite skipped (missing root or runner)';
    }
  }
}

function applyCheckOnlyStatuses(cells) {
  for (const cell of cells) {
    cell.status = 'unproven';
    if (cell.coverage === 'automated') {
      cell.statusReason = 'check-only: automated evidence not executed (use --run-tests)';
    } else if (cell.coverage === 'manual') {
      cell.statusReason = `manual: ${cell.manualReason}`;
    } else {
      cell.statusReason = `unproven: ${cell.reason}`;
    }
  }
}

function readProbeConfig(path) {
  const raw = readFileSync(path, 'utf8');
  const config = JSON.parse(raw);
  if (!config || typeof config !== 'object') throw new Error('probe config must be an object');
  if (!config.baseUrls || typeof config.baseUrls !== 'object') {
    throw new Error('probe config requires baseUrls { hub, ms, bff, wa, storage, tile }');
  }
  if (!config.principals || typeof config.principals !== 'object') {
    throw new Error('probe config requires principals { name: { headers } }');
  }
  for (const [name, principal] of Object.entries(config.principals)) {
    if (!principal || typeof principal !== 'object' || typeof principal.headers !== 'object') {
      throw new Error(`principal ${name} requires a headers object`);
    }
    for (const [header, value] of Object.entries(principal.headers)) {
      if (typeof value !== 'string') throw new Error(`principal ${name} header ${header} must be a string`);
    }
  }
  if (!config.ids || typeof config.ids !== 'object') {
    throw new Error('probe config requires ids { itwinA, itwinB, iModelA, ... }');
  }
  return config;
}

function fillTemplate(template, ids) {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
    const value = ids[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`probe template ${match} has no value in ids.${key}`);
    }
    return encodeURIComponent(value);
  });
}

function principalFor(config, cell) {
  const name = cell.probe?.principalHeader ?? cell.principal;
  const principal = config.principals[name];
  if (!principal) throw new Error(`probe config has no principal "${name}"`);
  return principal;
}

function redactValues(text, config) {
  let redacted = text;
  const secrets = new Set();
  for (const principal of Object.values(config.principals ?? {})) {
    for (const value of Object.values(principal.headers ?? {})) {
      if (typeof value !== 'string' || value.length < 8) continue;
      secrets.add(value);
      // A response may echo only the token part of "Bearer <token>".
      const bare = value.replace(/^(Bearer|Delegation)\s+/i, '');
      if (bare.length >= 8) secrets.add(bare);
    }
  }
  // Longest first so a full header value is redacted before its token part.
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    redacted = redacted.split(secret).join('[redacted]');
  }
  return redacted;
}

async function runProbes(cells, config, opts) {
  const results = {};
  for (const cell of cells) {
    const probe = cell.probe;
    if (!probe) {
      cell.status = 'unproven';
      cell.statusReason = 'no live probe defined';
      continue;
    }
    if (!['GET', 'HEAD'].includes(probe.method) && !opts.allowMutations) {
      cell.status = 'unproven';
      cell.statusReason = 'mutation probe skipped (pass --allow-mutations on an isolated stack)';
      continue;
    }
    const baseUrl = config.baseUrls[probe.surface ?? cell.surface];
    if (!baseUrl) {
      cell.status = 'unproven';
      cell.statusReason = `probe config has no baseUrls.${probe.surface ?? cell.surface}`;
      continue;
    }
    try {
      const url = `${String(baseUrl).replace(/\/+$/, '')}${fillTemplate(probe.path, config.ids)}`;
      const principal = principalFor(config, cell);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(opts.timeoutMs, 30_000));
      let response;
      try {
        response = await fetch(url, {
          method: probe.method,
          headers: principal.headers,
          redirect: 'manual',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const text = await response.text().catch(() => '');
      const observed = {
        request: { method: probe.method, url },
        response: {
          status: response.status,
          bodySnippet: redactValues(text.slice(0, 500), config),
        },
      };
      cell.observed = observed;
      cell.status = probe.expect.includes(response.status) ? 'pass' : 'fail';
      cell.statusReason = probe.expect.includes(response.status)
        ? `observed ${response.status} as expected`
        : `observed ${response.status}, expected ${probe.expect.join('/')}`;
      results[cell.id] = observed;
    } catch (error) {
      cell.status = 'fail';
      cell.statusReason = `probe error: ${error instanceof Error ? error.name : 'unknown'}`;
    }
  }
}

function summarize(cells) {
  const summary = {
    cells: cells.length,
    pass: cells.filter((cell) => cell.status === 'pass').length,
    fail: cells.filter((cell) => cell.status === 'fail').length,
    unproven: cells.filter((cell) => cell.status === 'unproven').length,
    automated: cells.filter((cell) => cell.coverage === 'automated').length,
    manual: cells.filter((cell) => cell.coverage === 'manual').length,
    none: cells.filter((cell) => cell.coverage === 'unproven').length,
  };
  summary.bySurface = {};
  for (const surface of REQUIRED_SURFACES) {
    const surfaceCells = cells.filter((cell) => cell.surface === surface);
    summary.bySurface[surface] = {
      cells: surfaceCells.length,
      pass: surfaceCells.filter((cell) => cell.status === 'pass').length,
      fail: surfaceCells.filter((cell) => cell.status === 'fail').length,
      unproven: surfaceCells.filter((cell) => cell.status === 'unproven').length,
    };
  }
  return summary;
}

function reportJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function reportMarkdown(report) {
  const lines = [];
  lines.push('# B3.1g negative matrix report');
  lines.push('');
  lines.push(`- Generated: ${report.environment.generatedAt}`);
  lines.push(`- Mode: ${report.environment.mode}`);
  lines.push(`- Node: ${report.environment.node} (${report.environment.platform})`);
  lines.push(`- Host: ${report.environment.hostname}`);
  for (const [key, repo] of Object.entries(report.environment.repos)) {
    lines.push(
      `- Repo ${key}: ${repo.present ? repo.path : '(not present)'}${repo.commit ? ` @ ${repo.commit.slice(0, 12)}` : ''}`,
    );
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Surface | Cells | Pass | Fail | Unproven |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const [surface, entry] of Object.entries(report.summary.bySurface)) {
    lines.push(`| ${surface} | ${entry.cells} | ${entry.pass} | ${entry.fail} | ${entry.unproven} |`);
  }
  lines.push(
    `| **Total** | **${report.summary.cells}** | **${report.summary.pass}** | **${report.summary.fail}** | **${report.summary.unproven}** |`,
  );
  lines.push('');

  for (const surface of REQUIRED_SURFACES) {
    const cells = report.cells.filter((cell) => cell.surface === surface);
    if (cells.length === 0) continue;
    lines.push(`## ${surface.toUpperCase()}`);
    lines.push('');
    lines.push('| Cell | Principal | Route / operation | Expected | Coverage | Status | Evidence / reason |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const cell of cells) {
      const evidence = cell.evidence?.length
        ? cell.evidence.map((item) => `${item.repo}:${item.file}`).join('<br>')
        : cell.manualReason || cell.reason || '';
      lines.push(
        `| \`${cell.id}\` | ${cell.principal} | ${cell.route} | ${escapePipes(String(cell.expected))} | ${cell.coverage} | **${cell.status}** | ${escapePipes(evidence)}${cell.statusReason ? `<br>${escapePipes(cell.statusReason)}` : ''} |`,
      );
    }
    lines.push('');
  }

  const unproven = report.cells.filter((cell) => cell.status === 'unproven');
  lines.push('## Unproven cells');
  lines.push('');
  if (unproven.length === 0) {
    lines.push('None.');
  } else {
    for (const cell of unproven) {
      lines.push(`- \`${cell.id}\` — ${cell.statusReason ?? cell.reason ?? cell.manualReason ?? 'unproven'}`);
    }
  }
  lines.push('');
  lines.push('## Blockers / known gaps');
  lines.push('');
  for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function escapePipes(value) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function blockersFor(cells) {
  const blockers = [];
  if (cells.some((cell) => cell.id === 'hub.service.data-scope.foreign-imodel')) {
    blockers.push(
      'Hub data-plane service scopes are service-wide, not bound to one iTwin/iModel. This is by design today and must be accepted or changed; do not report it as an ACL pass.',
    );
  }
  if (cells.some((cell) => cell.id === 'hub.rbac.itwin.write.editor' && cell.status !== 'pass')) {
    blockers.push('Seeded Admin/Editor/Viewer role behavior needs a live seeded Hub (unit resolver tests use synthetic roles).');
  }
  if (cells.some((cell) => cell.id === 'wa.baseline.service-scope')) {
    blockers.push('webhook-agent /baseline/process accepts only the shared X-API-Key; no signed service identity or iModel/job binding exists (X-21 residual).');
  }
  if (cells.some((cell) => cell.surface === 'storage')) {
    blockers.push('Storage/nginx /azurite anonymous access has no gateway auth in the current compose path; a live isolated-stack probe is required before claiming enforcement.');
  }
  if (cells.some((cell) => cell.surface === 'tile')) {
    blockers.push('Tile URLs are public-url tiles with SAS query and no per-user auth; needs an isolated-stack probe and a rendering/browser check.');
  }
  if (cells.some((cell) => cell.coverage === 'manual')) {
    blockers.push('Cells marked manual require a deployed/served stack or browser; their evidence is not proven by this check run.');
  }
  return blockers;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`error: ${error.message}\n\n${usage()}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(usage());
    return;
  }

  if (opts.mode === 'probe' && !opts.probeConfig) {
    console.error('error: --probe requires --probe-config FILE');
    process.exit(2);
  }

  const cells = MATRIX.map((cell) => ({ ...cell }));
  const environmentInfo = environment(opts);
  const validation = validateMatrix(cells, opts.roots);
  let testResults = null;
  let probeConfig = null;

  if (opts.mode === 'check') {
    // Manual/unproven cells always start unproven; automated cells are
    // upgraded to pass/fail only when --run-tests actually executes them.
    applyCheckOnlyStatuses(cells);
    if (opts.runTests) {
      testResults = runTestFileSets(cells, opts.roots, opts.timeoutMs);
      applyTestResults(cells, testResults);
    }
  } else {
    probeConfig = readProbeConfig(opts.probeConfig);
    await runProbes(cells, probeConfig, opts);
    if (opts.runTests) {
      testResults = runTestFileSets(cells, opts.roots, opts.timeoutMs);
      // Probe results are authoritative for probed cells; use unit results only
      // for cells that had no probe or were skipped.
      const probeStatus = new Map(cells.map((cell) => [cell.id, cell.status]));
      applyTestResults(cells, testResults);
      for (const cell of cells) {
        if (probeStatus.get(cell.id) === 'pass' || probeStatus.get(cell.id) === 'fail') {
          cell.status = probeStatus.get(cell.id);
          cell.statusReason = cell.observed
            ? `observed ${cell.observed.response.status}`
            : cell.statusReason;
        }
      }
    }
  }

  const summary = summarize(cells);
  const report = {
    schemaVersion: SCHEMA_VERSION,
    matrix: 'B3.1g-negative-matrix',
    environment: environmentInfo,
    validation: {
      ok: validation.issues.length === 0,
      issues: validation.issues,
      warnings: validation.warnings,
    },
    summary,
    blockers: blockersFor(cells),
    cells,
    testRuns: testResults,
  };

  const rendered = opts.format === 'json'
    ? reportJson(report)
    : reportMarkdown(report);

  if (opts.out) {
    mkdirSync(opts.out, { recursive: true });
    writeFileSync(join(opts.out, 'b31g-negative-matrix-report.json'), reportJson(report), 'utf8');
    writeFileSync(join(opts.out, 'b31g-negative-matrix-report.md'), reportMarkdown(report), 'utf8');
    // Keep stdout machine-readable: notices go to stderr.
    console.error(`report written to ${opts.out}`);
  }

  if (opts.format === 'both') {
    process.stdout.write(reportMarkdown(report));
    process.stdout.write('\n--- JSON ---\n');
    process.stdout.write(reportJson(report));
  } else {
    process.stdout.write(rendered);
  }

  if (validation.issues.length > 0) {
    console.error(`matrix validation failed with ${validation.issues.length} issue(s)`);
    process.exitCode = 1;
  }
  if (opts.runTests && summary.fail > 0) process.exitCode = 1;
  if (opts.mode === 'probe' && summary.fail > 0) process.exitCode = 1;
}

export {
  MATRIX,
  applyCheckOnlyStatuses,
  applyTestResults,
  defaultRoots,
  parseArgs,
  reportJson,
  reportMarkdown,
  runProbes,
  runTestFileSets,
  summarize,
  validateMatrix,
};

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(`fatal: ${error instanceof Error ? error.stack : String(error)}`);
    process.exit(2);
  });
}
