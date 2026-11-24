/**
 * Release-edge configuration tests.
 *
 *   node --test scripts/test/release-edge.test.mjs
 *
 * These are static, dependency-free checks over the release profile, the
 * release compose, the release nginx TLS template and the release-edge doc.
 * They never start Docker, read real certificates, or touch the network.
 *
 * What is proved:
 *   - the release edge requires an explicit TLS cert/key, canonical domain and
 *     signed-tile secret (no development .env value can satisfy them);
 *   - only the edge publishes host ports, and it publishes HTTP (redirect) +
 *     HTTPS explicitly;
 *   - the release edge mounts the release-only nginx profile, not the dev
 *     HTTP profile;
 *   - HTTPS-only business surface with HSTS/CSP/XFO/Referrer-Policy/no-store
 *     and request-id forwarding;
 *   - /azurite and tile/storage paths are never anonymous: non-tile storage
 *     paths 404, tile blobs require a valid edge_exp/edge_sig secure link;
 *   - the development compose and dev nginx profile stay cert-free and keep
 *     their existing anonymous loopback tile proxy.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadReleaseProfile,
  parseReleaseCompose,
  validateReleaseCompose,
} from '../release-profile-lib.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RELEASE_COMPOSE = 'docker-compose.release.yml';
const DEV_COMPOSE = 'docker-compose.yml';
const RELEASE_NGINX_CONF = 'deploy/release/nginx.conf';
const RELEASE_NGINX_TEMPLATE = 'deploy/release/nginx-tls.conf.template';
const DEV_NGINX_TEMPLATE = 'deploy/default.conf.template';
const RELEASE_EDGE_DOC = 'docs/operations/RELEASE-EDGE.md';
const RELEASE_PROFILE = 'deploy/release/release-profile.json';

const EDGE_INPUTS = [
  'RELEASE_DOMAIN',
  'RELEASE_TLS_CERT_FILE',
  'RELEASE_TLS_KEY_FILE',
  'RELEASE_TILE_SIGNING_SECRET',
];

function read(rel) {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

/** Strip whole-line YAML/nginx comments so policy checks see directives only. */
function stripLineComments(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

function releaseIssues() {
  const profile = loadReleaseProfile(REPO_ROOT);
  assert.equal(profile.exists, true);
  assert.deepEqual(profile.errors, []);
  const issues = validateReleaseCompose(read(RELEASE_COMPOSE), profile.value, {
    mode: 'release',
    profileValid: true,
  });
  return { profile, issues };
}

function walkFiles(relDir) {
  const root = join(REPO_ROOT, relDir);
  const files = [];
  for (const entry of readdirSync(root)) {
    const absolute = join(root, entry);
    if (statSync(absolute).isDirectory()) {
      files.push(...walkFiles(join(relDir, entry)));
    } else {
      files.push(join(relDir, entry));
    }
  }
  return files;
}

test('release edge requires TLS certificate, key, domain and tile secret', () => {
  const { profile, issues } = releaseIssues();
  assert.deepEqual(
    issues.filter((issue) => issue.severity === 'error'),
    [],
  );

  const required = new Set(profile.value.requiredInputs);
  for (const input of EDGE_INPUTS) {
    assert.equal(required.has(input), true, `${input} missing from requiredInputs`);
  }

  const compose = read(RELEASE_COMPOSE);
  for (const input of EDGE_INPUTS) {
    assert.match(
      compose,
      new RegExp(`\\$\\{${input}:\\?[^}]+\\}`),
      `${input} must be a required compose interpolation with no default`,
    );
  }

  const parsed = parseReleaseCompose(compose);
  const requiredVars = new Set(parsed.requiredVars.map((entry) => entry.name));
  for (const input of EDGE_INPUTS) {
    assert.equal(requiredVars.has(input), true, `${input} not required in release compose`);
  }

  // The nginx container must actually receive the domain + tile secret, and
  // the cert/key must be required mount sources (not just declared globally).
  const nginx = parsed.services.find((service) => service.name === 'nginx');
  assert.ok(nginx, 'release compose has no nginx service');
  const env = new Map(nginx.environment.map((entry) => [entry.key, entry.value]));
  for (const input of ['RELEASE_DOMAIN', 'RELEASE_TILE_SIGNING_SECRET']) {
    assert.match(
      env.get(input) ?? '',
      new RegExp(`^"\\$\\{${input}:\\?[^}]+\\}"$`),
      `${input} must be injected into the nginx container as a required value`,
    );
  }
  for (const input of ['RELEASE_TLS_CERT_FILE', 'RELEASE_TLS_KEY_FILE']) {
    assert.match(
      compose,
      new RegExp(`source:\\s+"\\$\\{${input}:\\?[^}]+\\}"`),
      `${input} must be a required bind-mount source`,
    );
  }

  // Every edge input is actually consumed (no stale profile declarations).
  const unused = issues.filter(
    (issue) =>
      issue.subject === 'input-unused' &&
      EDGE_INPUTS.some((input) => issue.subject.includes(input)),
  );
  assert.deepEqual(unused, []);
});

test('only the release edge publishes host ports (HTTP redirect + HTTPS)', () => {
  const { issues } = releaseIssues();
  assert.deepEqual(
    issues.filter((issue) => issue.severity === 'error'),
    [],
  );

  const parsed = parseReleaseCompose(read(RELEASE_COMPOSE));
  const nginx = parsed.services.find((service) => service.name === 'nginx');
  assert.ok(nginx, 'release compose has no nginx edge service');
  for (const service of parsed.services) {
    if (service.name === 'nginx') continue;
    assert.equal(
      service.ports.length,
      0,
      `${service.name} must not publish a host port in release mode`,
    );
  }

  assert.equal(nginx.ports.length, 2);
  const ports = nginx.ports.map((port) => port.value);
  assert.equal(ports.some((value) => value.endsWith(':80')), true);
  assert.equal(ports.some((value) => value.endsWith(':443')), true);
  for (const value of ports) {
    assert.match(
      value,
      /^\$\{RELEASE_EDGE_BIND:-127\.0\.0\.1\}:\$\{RELEASE_EDGE_(?:HTTP|HTTPS)_PORT:-\d+\}:\d+$/,
      'edge ports must keep an explicit host bind (safe loopback default)',
    );
  }

  // No implicit 0.0.0.0 default anywhere in the release compose.
  assert.doesNotMatch(read(RELEASE_COMPOSE), /0\.0\.0\.0:/);
});

test('release edge mounts the release TLS profile, never the dev profile', () => {
  const compose = read(RELEASE_COMPOSE);
  assert.match(compose, /source:\s+\.\/deploy\/release\/nginx\.conf\b/);
  assert.match(compose, /target:\s+\/etc\/nginx\/nginx\.conf\b/);
  assert.match(
    compose,
    /source:\s+\.\/deploy\/release\/nginx-tls\.conf\.template\b/,
  );
  assert.match(
    compose,
    /target:\s+\/etc\/nginx\/templates\/nginx-tls\.conf\.template\b/,
  );
  assert.doesNotMatch(compose, /deploy\/nginx\.conf:/);
  assert.doesNotMatch(compose, /deploy\/default\.conf\.template:/);

  // Cert/key are host-path inputs mounted read-only at fixed container paths.
  // Long bind syntax is deliberate: short syntax is ambiguous for Windows
  // drive-letter certificate paths.
  assert.match(compose, /source:\s+"\$\{RELEASE_TLS_CERT_FILE:\?[^}]+\}"/);
  assert.match(compose, /target:\s+\/etc\/nginx\/tls\/tls\.crt\b/);
  assert.match(compose, /source:\s+"\$\{RELEASE_TLS_KEY_FILE:\?[^}]+\}"/);
  assert.match(compose, /target:\s+\/etc\/nginx\/tls\/tls\.key\b/);
  assert.equal(
    (compose.match(/read_only:\s+true/g) ?? []).length >= 4,
    true,
    'all release edge bind mounts must be read-only',
  );

  const main = read(RELEASE_NGINX_CONF);
  assert.match(main, /include\s+\/etc\/nginx\/conf\.d\/nginx-tls\.conf;/);
  // The stock default.conf / wildcard include must not be active: it would
  // open an additional cleartext server on :80.
  assert.doesNotMatch(main, /include\s+\/etc\/nginx\/conf\.d\/\*\.conf;/);
  assert.match(main, /server_tokens\s+off;/);
  assert.match(main, /ssl_protocols\s+TLSv1\.2\s+TLSv1\.3;/);

  const template = read(RELEASE_NGINX_TEMPLATE);
  assert.match(template, /ssl_certificate\s+\/etc\/nginx\/tls\/tls\.crt;/);
  assert.match(template, /ssl_certificate_key\s+\/etc\/nginx\/tls\/tls\.key;/);
});

test('HTTPS only, HTTP redirects to the canonical domain with security headers', () => {
  const template = read(RELEASE_NGINX_TEMPLATE);

  assert.match(template, /listen\s+80\s+default_server;/);
  assert.match(template, /listen\s+443\s+ssl\s+default_server;/);
  assert.match(
    template,
    /return\s+308\s+https:\/\/\$\{RELEASE_DOMAIN\}\$request_uri;/,
  );

  // Container health uses a loopback-only cleartext listener: BusyBox wget in
  // nginx:alpine cannot skip certificate verification, and the public :80
  // surface must stay redirect-only.
  assert.match(template, /listen\s+127\.0\.0\.1:8081;/);
  const compose = read(RELEASE_COMPOSE);
  assert.match(compose, /http:\/\/127\.0\.0\.1:8081\/healthz/);
  assert.doesNotMatch(compose, /"wget",\s*"--no-check-certificate"/);
  // The redirect target is the configured domain, never the client Host.
  assert.doesNotMatch(template, /return\s+308\s+https:\/\/\$host/);

  assert.match(
    template,
    /add_header\s+Strict-Transport-Security\s+"max-age=31536000; includeSubDomains"\s+always;/,
  );
  assert.match(template, /add_header\s+X-Frame-Options\s+"DENY"\s+always;/);
  assert.match(
    template,
    /add_header\s+Referrer-Policy\s+"strict-origin-when-cross-origin"\s+always;/,
  );
  assert.match(template, /add_header\s+X-Content-Type-Options\s+"nosniff"\s+always;/);
  assert.match(template, /add_header\s+Permissions-Policy\s+"[^"]+"\s+always;/);
  assert.match(template, /add_header\s+Content-Security-Policy\s+"[^"]+"\s+always;/);
  assert.match(template, /frame-ancestors 'none'/);
  assert.match(template, /object-src 'none'/);

  // no-store is enforced for auth/API/storage/HTML via the main-config map
  // and a single server-level add_header in the TLS template.
  const main = read(RELEASE_NGINX_CONF);
  assert.match(main, /map\s+\$uri\s+\$luban_cache_control\s*\{/);
  assert.match(main, /auth\|accesscontrol/);
  assert.match(main, /azurite/);
  assert.match(
    template,
    /add_header\s+Cache-Control\s+\$luban_cache_control\s+always;/,
  );

  // Request-id is validated/generated once and forwarded on every proxy route.
  assert.match(main, /map\s+\$http_x_request_id\s+\$luban_request_id\s*\{/);
  assert.match(template, /add_header\s+X-Request-ID\s+\$luban_request_id\s+always;/);
  const directives = stripLineComments(template);
  const proxyPasses = directives.match(/^\s*proxy_pass\s+/gm) ?? [];
  const forwardedIds =
    directives.match(/^\s*proxy_set_header\s+X-Request-ID\s+\$luban_request_id;/gm) ??
    [];
  assert.equal(proxyPasses.length > 0, true);
  assert.equal(
    forwardedIds.length,
    proxyPasses.length,
    'every proxied release location must forward X-Request-ID',
  );
});

test('/azurite and tile/storage paths are never anonymous in release', () => {
  const template = stripLineComments(read(RELEASE_NGINX_TEMPLATE));

  // Exact container/index paths denied.
  assert.match(template, /location\s+=\s+\/azurite\s*\{\s*return\s+404;\s*\}/);
  assert.match(template, /location\s+=\s+\/azurite\/\s*\{\s*return\s+404;\s*\}/);

  // The only azurite proxy path requires an expiring secure link.
  const signedTile = template.match(
    /location\s+~\s+\^\/azurite\/[^{]+\{\s*([\s\S]*?)\n\s{4}\}/,
  );
  assert.ok(signedTile, 'signed tile location not found');
  assert.match(signedTile[1], /secure_link\s+\$arg_edge_sig,\$arg_edge_exp;/);
  assert.match(
    signedTile[1],
    /secure_link_md5\s+"\$secure_link_expires\$uri:\$\{RELEASE_TILE_SIGNING_SECRET\}";/,
  );
  assert.match(signedTile[1], /if\s+\(\$secure_link\s*=\s*""\)\s*\{\s*return\s+403;\s*\}/);
  assert.match(signedTile[1], /if\s+\(\$secure_link\s*=\s*"0"\)\s*\{\s*return\s+410;\s*\}/);
  assert.match(signedTile[1], /proxy_pass\s+http:\/\/luban_azurite\//);
  assert.doesNotMatch(signedTile[1], /proxy_pass\s+http:\/\/azurite:10000/);

  // All other /azurite paths fall through to an explicit deny.
  assert.match(template, /location\s+~\s+\^\/azurite\/\s*\{\s*return\s+404;\s*\}/);
  assert.match(
    template,
    /location\s+~\s+\^\/\(\?:tiles\|storage\|blob\)\(\?:\/\|\$\)\s*\{\s*return\s+404;\s*\}/,
  );

  // No bare proxy_pass to Azurite and no dev-style rewrite that strips the
  // /azurite prefix and forwards arbitrary blobs.
  assert.doesNotMatch(template, /proxy_pass\s+http:\/\/azurite:10000/);
  assert.doesNotMatch(template, /rewrite\s+\^\/azurite\/\(\.\*\)\$?\s+\/\$1/);
});

test('development compose and dev nginx profile stay cert-free', () => {
  const devCompose = read(DEV_COMPOSE);
  assert.doesNotMatch(devCompose, /RELEASE_TLS/);
  assert.doesNotMatch(devCompose, /RELEASE_DOMAIN/);
  assert.doesNotMatch(devCompose, /RELEASE_TILE_SIGNING/);
  assert.doesNotMatch(devCompose, /deploy\/release\//);
  assert.doesNotMatch(devCompose, /ssl_certificate|:443/);

  const parsed = parseReleaseCompose(devCompose);
  const nginx = parsed.services.find((service) => service.name === 'nginx');
  assert.ok(nginx, 'dev compose has no nginx service');
  assert.deepEqual(
    nginx.ports.map((port) => port.value),
    ['0.0.0.0:5301:80'],
  );
  assert.match(devCompose, /\.\/deploy\/nginx\.conf:\/etc\/nginx\/nginx\.conf:ro/);
  assert.match(
    devCompose,
    /\.\/deploy\/default\.conf\.template:\/etc\/nginx\/templates\/default\.conf\.template:ro/,
  );

  // Dev keeps its anonymous loopback tile proxy; only release applies the
  // signed/deny-by-default storage gate.
  const devTemplate = read(DEV_NGINX_TEMPLATE);
  assert.match(devTemplate, /location\s+\/azurite\/\s*\{\s*proxy_pass\s+http:\/\/azurite:10000\/;/);
  assert.doesNotMatch(devTemplate, /secure_link/);
  assert.doesNotMatch(devTemplate, /Strict-Transport-Security/);
});

test('release edge keeps the dev route surface (no route regression)', () => {
  const releaseTemplate = read(RELEASE_NGINX_TEMPLATE);
  const devTemplate = read(DEV_NGINX_TEMPLATE);
  const prefixes = [
    '/api',
    '/ws',
    '/ipc',
    '/itwins',
    '/imodels',
    '/auth',
    '/accesscontrol',
    '/webhooks',
    '/users',
    '/files',
    '/oauth',
    '/.well-known',
  ];
  for (const prefix of prefixes) {
    assert.match(
      devTemplate,
      new RegExp(`location\\s+${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`),
    );
    assert.match(
      releaseTemplate,
      new RegExp(`location\\s+${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`),
      `release edge lost dev route ${prefix}`,
    );
  }
  assert.match(releaseTemplate, /location\s+=\s+\/__spa\s*\{/);
  assert.match(releaseTemplate, /location\s+\/\s*\{/);
});

test('no certificate or private key material is committed', () => {
  const files = [
    RELEASE_COMPOSE,
    RELEASE_PROFILE,
    RELEASE_NGINX_CONF,
    RELEASE_NGINX_TEMPLATE,
    RELEASE_EDGE_DOC,
    ...walkFiles('deploy/release'),
  ];
  for (const rel of files) {
    const text = read(rel);
    assert.doesNotMatch(
      text,
      /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/,
      `${relative('.', rel)} contains private key material`,
    );
    assert.doesNotMatch(
      text,
      /-----BEGIN CERTIFICATE-----/,
      `${relative('.', rel)} contains certificate material`,
    );
  }
});

test('WA baseline/debug residual is documented and release pins trigger auth', () => {
  const compose = read(RELEASE_COMPOSE);
  const parsed = parseReleaseCompose(compose);
  const wa = parsed.services.find((service) => service.name === 'webhook-agent');
  assert.ok(wa, 'release compose has no webhook-agent service');
  assert.equal(
    wa.environment.some(
      (entry) =>
        entry.key === 'BASELINE_TRIGGER_AUTH' && entry.value === '"service"',
    ),
    true,
    'release must pin BASELINE_TRIGGER_AUTH to service',
  );

  const doc = read(RELEASE_EDGE_DOC);
  for (const phrase of [
    'job binding',
    'service identity',
    'BASELINE_TRIGGER_AUTH',
    'edge_sig',
    'secure_link',
    'fail-closed',
  ]) {
    assert.match(
      doc.toLowerCase(),
      new RegExp(phrase.toLowerCase()),
      `release edge doc missing "${phrase}"`,
    );
  }
});
