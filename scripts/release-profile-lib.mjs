/**
 * Release-profile parsing and validation (dependency-free).
 *
 * A "release profile" is the deliberate replacement for the development
 * compose stack:
 *
 *   docker-compose.release.yml        release stack (edge-only host port)
 *   deploy/release/release-profile.json  image variables + required inputs
 *
 * The profile is a template: every image is a required `${RELEASE_*_IMAGE:?}`
 * variable, and every secret is a required `${RELEASE_*:?}` variable with no
 * default. scripts/render-release-images.mjs resolves the image variables from
 * release-manifest.json, so the manifest is the single source of registry
 * digests. Nothing here calls docker/compose or the network.
 *
 * The parser intentionally supports the block-YAML subset used by the release
 * compose file. Inline `ports: [...]` / `environment: {...}` mappings are
 * rejected so the release policy can see every value.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const RELEASE_PROFILE_PATH = 'deploy/release/release-profile.json';
export const RELEASE_COMPOSE_PATHS = ['docker-compose.release.yml'];
export const RELEASE_EDGE_SERVICES = ['nginx'];

export const RELEASE_IMAGE_VAR_RE = /^RELEASE_[A-Z0-9_]+_IMAGE$/;
export const RELEASE_INPUT_VAR_RE = /^RELEASE_[A-Z0-9_]+$/;
export const REQUIRED_VAR_RE = /^\$\{([A-Za-z_][A-Za-z0-9_]*):\?([^}]+)\}$/;
export const REQUIRED_VAR_ANY_RE =
  /\$\{([A-Za-z_][A-Za-z0-9_]*):\?[^}]+\}/g;

const PROFILE_KEYS = ['schemaVersion', 'description', 'images', 'requiredInputs'];
const PROFILE_SCHEMA_VERSION = 1;

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function unquoteScalar(value) {
  let text = String(value ?? '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }
  return text;
}

/** True for root docker-compose.release.yml and deploy/release/*compose*.yml. */
export function isReleaseComposePath(relPath) {
  const path = String(relPath ?? '').replace(/\\/g, '/');
  if (/(?:^|\/)docker-compose\.release\.ya?ml$/i.test(path)) return true;
  return /^deploy\/release\/(?:.*\/)?(?:docker-)?compose(?:\.[A-Za-z0-9._-]+)?\.ya?ml$/i.test(
    path,
  );
}

/** Parse an exact required interpolation `${NAME:?message}`. */
export function parseRequiredVar(raw) {
  const value = unquoteScalar(raw);
  const match = REQUIRED_VAR_RE.exec(value);
  return match === null ? undefined : { name: match[1], message: match[2] };
}

/**
 * Strip a YAML inline comment while respecting quoted scalars. The release
 * policy never needs '#' inside values, but quoted secrets may contain one.
 */
export function stripInlineComment(line) {
  let quote;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote !== undefined) {
      if (char === quote && line[index - 1] !== '\\') quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index).trimEnd();
    }
  }
  return line;
}

function parseEnvironmentItem(item, line) {
  const assignment = /^([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(item);
  if (assignment !== null) {
    return { key: assignment[1], value: assignment[2].trim(), line };
  }
  const mapping = /^([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*(.*)$/.exec(item);
  if (mapping !== null) {
    return { key: mapping[1], value: mapping[2].trim(), line };
  }
  return { key: item, value: undefined, line };
}

/**
 * Parse the release compose subset into services plus all required
 * `${VAR:?message}` occurrences. Never throws.
 */
export function parseReleaseCompose(text) {
  const services = [];
  const errors = [];
  const requiredVars = [];
  let inServices = false;
  let current;
  let listMode;
  let listIndent = 0;

  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((raw, index) => {
    const line = index + 1;
    if (/^\s*$/.test(raw) || /^\s*#/.test(raw)) return;
    const indent = /^ */.exec(raw)[0].length;
    const content = stripInlineComment(raw.slice(indent));
    if (content === '') return;

    for (const match of content.matchAll(REQUIRED_VAR_ANY_RE)) {
      requiredVars.push({ name: match[1], line });
    }

    if (indent === 0) {
      current = undefined;
      listMode = undefined;
      inServices = content === 'services:';
      return;
    }
    if (!inServices) return;

    if (indent === 2 && /^[A-Za-z0-9._-]+:\s*$/.test(content)) {
      current = {
        name: content.slice(0, -1),
        line,
        image: undefined,
        imageLine: undefined,
        build: undefined,
        buildLine: undefined,
        pullPolicy: undefined,
        pullPolicyLine: undefined,
        ports: [],
        envFiles: [],
        environment: [],
      };
      services.push(current);
      listMode = undefined;
      return;
    }
    if (current === undefined) return;

    if (listMode === 'environment' && indent >= listIndent + 2) {
      const item = content.startsWith('- ')
        ? content.slice(2).trim()
        : content;
      current.environment.push(parseEnvironmentItem(item, line));
      return;
    }
    if (listMode !== undefined && indent >= listIndent + 2 && /^- /.test(content)) {
      const item = unquoteScalar(content.replace(/^- /, '').trim());
      if (listMode === 'ports') {
        current.ports.push({ value: item, line });
      } else if (listMode === 'env_file') {
        current.envFiles.push({ value: item, line });
      }
      return;
    }

    listMode = undefined;
    const keyMatch = /^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/.exec(content);
    if (keyMatch === null) return;
    const key = keyMatch[1];
    const value = (keyMatch[2] ?? '').trim();

    if (key === 'image') {
      current.image = unquoteScalar(value);
      current.imageLine = line;
      return;
    }
    if (key === 'build') {
      current.build = value === '' ? '.' : value;
      current.buildLine = line;
      return;
    }
    if (key === 'pull_policy') {
      current.pullPolicy = unquoteScalar(value);
      current.pullPolicyLine = line;
      return;
    }
    if (key === 'ports' || key === 'env_file' || key === 'environment') {
      if (value !== '') {
        errors.push({
          line,
          message:
            `${key} must use block form in the release compose; ` +
            'inline mappings cannot be audited by the release policy',
        });
        return;
      }
      listMode = key;
      listIndent = indent;
      if (key === 'ports') current.ports = current.ports ?? [];
      return;
    }
  });

  return { services, errors, requiredVars };
}

/** Strip any tag/digest from an image reference (registry port preserved). */
export function normalizeImageName(ref) {
  let value = String(ref ?? '').trim();
  const digestAt = value.indexOf('@');
  if (digestAt >= 0) value = value.slice(0, digestAt);
  const lastSlash = value.lastIndexOf('/');
  const tail = value.slice(lastSlash + 1);
  const colon = tail.indexOf(':');
  if (colon >= 0) {
    value = value.slice(0, lastSlash + 1) + tail.slice(0, colon);
  }
  return value;
}

/** Image name without tag or digest (registry port allowed). */
export function isImageNameWithoutTag(value) {
  if (typeof value !== 'string') return false;
  const name = value.trim();
  if (name === '' || name.length > 512) return false;
  if (/[\s@#]/.test(name)) return false;
  if (!name.includes('/')) return false;
  const tail = name.slice(name.lastIndexOf('/') + 1);
  if (tail === '' || tail.includes(':')) return false;
  if (name.toLowerCase().endsWith(':latest')) return false;
  return true;
}

export function validateReleaseProfile(value) {
  const errors = [];
  if (!isPlainObject(value)) return ['release profile: must be a JSON object'];
  for (const key of Object.keys(value)) {
    if (!PROFILE_KEYS.includes(key)) errors.push(`${key}: unknown field`);
  }
  if (value.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    errors.push(`schemaVersion: must be ${PROFILE_SCHEMA_VERSION}`);
  }
  if (value.description !== undefined && typeof value.description !== 'string') {
    errors.push('description: must be a string');
  }

  const images = value.images;
  if (!isPlainObject(images) || Object.keys(images).length === 0) {
    errors.push('images: must be a non-empty object of RELEASE_*_IMAGE -> name');
  } else {
    const seenNames = new Set();
    for (const [key, imageName] of Object.entries(images)) {
      if (!RELEASE_IMAGE_VAR_RE.test(key)) {
        errors.push(
          `images.${key}: variable must match RELEASE_<NAME>_IMAGE`,
        );
      }
      if (!isImageNameWithoutTag(imageName)) {
        errors.push(
          `images.${key}: must be a registry image name without tag or digest`,
        );
        continue;
      }
      const normalized = imageName.toLowerCase();
      if (seenNames.has(normalized)) {
        errors.push(`images.${key}: duplicate image name ${imageName}`);
      }
      seenNames.add(normalized);
    }
  }

  const requiredInputs = value.requiredInputs ?? [];
  if (!Array.isArray(requiredInputs)) {
    errors.push('requiredInputs: must be an array');
  } else {
    const seen = new Set();
    for (const [index, input] of requiredInputs.entries()) {
      if (typeof input !== 'string' || !RELEASE_INPUT_VAR_RE.test(input)) {
        errors.push(
          `requiredInputs[${index}]: must be a RELEASE_* variable name`,
        );
        continue;
      }
      if (seen.has(input)) {
        errors.push(`requiredInputs[${index}]: duplicate ${input}`);
      }
      seen.add(input);
      if (isPlainObject(images) && Object.hasOwn(images, input)) {
        errors.push(
          `requiredInputs[${index}]: ${input} is an image variable; declare it under images`,
        );
      }
    }
  }
  return errors;
}

export function loadReleaseProfile(root, relPath = RELEASE_PROFILE_PATH) {
  const absolute = resolve(root, relPath);
  const result = {
    path: relPath.replace(/\\/g, '/'),
    exists: existsSync(absolute),
    value: undefined,
    errors: [],
  };
  if (!result.exists) return result;
  let text;
  try {
    text = readFileSync(absolute, 'utf8').replace(/^﻿/, '');
  } catch {
    result.errors.push(`cannot read ${result.path}`);
    return result;
  }
  try {
    result.value = JSON.parse(text);
  } catch {
    result.errors.push(`${result.path} is not valid JSON`);
    return result;
  }
  result.errors.push(...validateReleaseProfile(result.value));
  return result;
}

function isSensitiveKey(key) {
  // Mirrors the release hygiene secrets.defaults classifier. Kept here so the
  // compose policy can be tested without importing the whole checker.
  const sensitive =
    /(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|ACCOUNT[_-]?KEY|PRIVATE[_-]?KEY|SIGNING[_-]?KEY)/i;
  const nonSecret =
    /(?:EXPIRES?|EXPIRATION|TTL|TIMEOUT|URL|URI|PORT|HOST|NAME|USERNAME|ENDPOINT|LIMIT|INTERVAL|MINUTES|SECONDS|CACHE|LENGTH|SIZE|COUNT|ENABLED|MODE)/i;
  return sensitive.test(key) && !nonSecret.test(key);
}

function hasExplicitHostBind(value) {
  const port = unquoteScalar(value);
  const host = '(?:[0-9]{1,3}(?:\\.[0-9]{1,3}){3}|\\[[0-9a-fA-F:]+\\]|\\$\\{[^}]+\\})';
  const number = '(?:\\d+|\\$\\{[^}]+\\})';
  return new RegExp(`^${host}:${number}:${number}(?:/(?:tcp|udp))?$`).test(
    port,
  );
}

export function canonicalizeSha256(value) {
  const match = /^(?:sha256:)?([0-9a-fA-F]{64})$/.exec(
    String(value ?? '').trim(),
  );
  return match === null ? undefined : `sha256:${match[1].toLowerCase()}`;
}

/**
 * Resolve every profile image variable to <name>@sha256:<digest> using the
 * release manifest. The manifest is the only digest source; missing images
 * are an error (never a guessed or placeholder digest).
 */
export function renderReleaseImageEnv(manifest, profile) {
  const errors = [];
  const lines = [];
  const images = [];
  if (!isPlainObject(manifest) || !Array.isArray(manifest.images)) {
    return {
      errors: ['release manifest has no images[] array'],
      lines,
      images,
    };
  }
  if (!isPlainObject(profile?.images)) {
    return {
      errors: ['release profile has no images object'],
      lines,
      images,
    };
  }
  const manifestImages = new Map();
  for (const image of manifest.images) {
    if (!isPlainObject(image) || typeof image.name !== 'string') continue;
    const name = normalizeImageName(image.name);
    if (manifestImages.has(name)) {
      errors.push(
        `${name} appears more than once in the release manifest images[]`,
      );
      continue;
    }
    manifestImages.set(name, image.digest);
  }
  for (const variable of Object.keys(profile.images).sort()) {
    const name = profile.images[variable];
    const digest = manifestImages.get(name);
    if (digest === undefined) {
      errors.push(
        `${name} (${variable}) is missing from the release manifest images[]`,
      );
      continue;
    }
    const canonical = canonicalizeSha256(digest);
    if (canonical === undefined) {
      errors.push(`${name} (${variable}) has an invalid manifest digest`);
      continue;
    }
    const ref = `${name}@${canonical}`;
    lines.push(`${variable}=${ref}`);
    images.push({ variable, name, digest: canonical, ref });
  }
  return { errors, lines, images };
}

/**
 * Validate one parsed release compose against a release profile.
 * Returns structured issues; the caller maps them to the hygiene report.
 * All errors fail closed; only unused declarations and (outside release mode)
 * a missing pull_policy are warnings.
 */
export function validateReleaseCompose(
  text,
  profile,
  { mode = 'local', profileValid = true } = {},
) {
  const parsed = parseReleaseCompose(text);
  const issues = parsed.errors.map((error) => ({
    severity: 'error',
    line: error.line,
    subject: 'compose-parse',
    message: error.message,
    hint: 'Keep the release compose in block YAML so every image/secret/port is auditable.',
  }));

  for (const service of parsed.services) {
    if (service.build !== undefined) {
      issues.push({
        severity: 'error',
        line: service.buildLine,
        subject: `build-section:${service.name}`,
        message:
          'release compose must consume published artifacts, not build images locally',
        hint: 'Remove build:; pin the published image through the release manifest.',
      });
    }

    if (service.image === undefined || service.image === '') {
      issues.push({
        severity: 'error',
        line: service.line,
        subject: `image-missing:${service.name}`,
        message: 'release compose service has no image',
        hint: 'Use a required RELEASE_*_IMAGE variable resolved from the release manifest.',
      });
    } else if (service.image.includes('${')) {
      const required = parseRequiredVar(service.image);
      if (required === undefined) {
        issues.push({
          severity: 'error',
          line: service.imageLine,
          subject: `image-not-required:${service.name}`,
          message:
            'release compose image is an interpolation with a default or no required marker',
          hint:
            'Use exactly ${RELEASE_<NAME>_IMAGE:?<message>}; render it from release-manifest.json.',
        });
      } else if (!RELEASE_IMAGE_VAR_RE.test(required.name)) {
        issues.push({
          severity: 'error',
          line: service.imageLine,
          subject: `image-var-name:${required.name}`,
          message: 'release image variable must match RELEASE_<NAME>_IMAGE',
          hint: 'Rename the variable and update deploy/release/release-profile.json.',
        });
      } else if (
        profileValid &&
        !(isPlainObject(profile?.images) &&
          Object.hasOwn(profile.images, required.name))
      ) {
        issues.push({
          severity: 'error',
          line: service.imageLine,
          subject: `image-var-unmapped:${required.name}`,
          message:
            'release image variable is not declared in deploy/release/release-profile.json',
          hint: 'Declare the variable and its registry image name so the manifest digest can be resolved.',
        });
      }
    } else {
      issues.push({
        severity: 'error',
        line: service.imageLine,
        subject: `image-literal:${service.name}`,
        message:
          'release compose image is a literal reference; the manifest must be the only digest source',
        hint:
          'Replace the literal with ${RELEASE_<NAME>_IMAGE:?<message>} and declare it in the release profile.',
      });
    }

    if (service.pullPolicy !== 'always') {
      issues.push({
        severity: mode === 'release' ? 'error' : 'warning',
        line: service.pullPolicyLine ?? service.line,
        subject: `pull-policy:${service.name}`,
        message: 'release compose service does not set pull_policy: always',
        hint:
          'Digest references are immutable; pull_policy: always prevents a stale local image from being used unnoticed.',
      });
    }

    if (service.ports.length > 0 && !RELEASE_EDGE_SERVICES.includes(service.name)) {
      issues.push({
        severity: 'error',
        line: service.ports[0].line,
        subject: `non-edge-ports:${service.name}`,
        message:
          'release compose publishes a host port for a non-edge service',
        hint:
          'Only the edge (nginx) may publish a host port; keep infrastructure and application services on the internal network.',
      });
    }
    if (
      RELEASE_EDGE_SERVICES.includes(service.name) &&
      service.ports.length === 0
    ) {
      issues.push({
        severity: 'error',
        line: service.line,
        subject: `edge-ports-missing:${service.name}`,
        message: 'release edge service publishes no host port',
        hint: 'Publish exactly the edge port.',
      });
    }
    for (const port of service.ports) {
      if (!hasExplicitHostBind(port.value)) {
        issues.push({
          severity: 'error',
          line: port.line,
          subject: `port-bind:${service.name}`,
          message:
            'release publish entry must state an explicit host address (host:container:container)',
          hint:
            'Avoid an implicit 0.0.0.0 bind; use ${RELEASE_EDGE_BIND:-127.0.0.1}:${RELEASE_EDGE_PORT:-5301}:80 or another explicit address.',
        });
      }
    }

    for (const envFile of service.envFiles) {
      const required = parseRequiredVar(envFile.value);
      if (
        required === undefined ||
        !required.name.startsWith('RELEASE_')
      ) {
        issues.push({
          severity: 'error',
          line: envFile.line,
          subject: `env-file:${service.name}`,
          message:
            'release compose env_file must be a required RELEASE_* path, not a dev .env literal',
          hint:
            'Point RELEASE_ENV_FILE at the release runtime env file supplied by the operator/secret store.',
        });
      }
    }

    for (const entry of service.environment) {
      if (!isSensitiveKey(entry.key)) continue;
      const required = parseRequiredVar(entry.value ?? '');
      if (
        required === undefined ||
        !required.name.startsWith('RELEASE_')
      ) {
        issues.push({
          severity: 'error',
          line: entry.line,
          subject: `secret-not-required:${entry.key}`,
          message:
            'release compose secret must be required from a RELEASE_* variable with no default',
          hint:
            'Remove literal/default values; supply the secret at boot from the release secret store.',
        });
      }
    }
  }

  if (profileValid) {
    const imageVars = new Set(
      isPlainObject(profile?.images) ? Object.keys(profile.images) : [],
    );
    const requiredInputs = new Set(
      Array.isArray(profile?.requiredInputs) ? profile.requiredInputs : [],
    );
    const seen = new Set();
    for (const variable of parsed.requiredVars) {
      if (seen.has(variable.name)) continue;
      seen.add(variable.name);
      if (RELEASE_IMAGE_VAR_RE.test(variable.name)) {
        if (!imageVars.has(variable.name)) {
          issues.push({
            severity: 'error',
            line: variable.line,
            subject: `image-var-unmapped:${variable.name}`,
            message:
              'required image variable is not declared in the release profile',
            hint: 'Declare it under images in deploy/release/release-profile.json.',
          });
        }
        continue;
      }
      if (!RELEASE_INPUT_VAR_RE.test(variable.name)) {
        issues.push({
          severity: 'error',
          line: variable.line,
          subject: `input-var-name:${variable.name}`,
          message: 'required variable must use the RELEASE_ prefix',
          hint: 'RELEASE_* names keep development .env values from satisfying the release profile.',
        });
        continue;
      }
      if (!requiredInputs.has(variable.name)) {
        issues.push({
          severity: 'error',
          line: variable.line,
          subject: `input-undeclared:${variable.name}`,
          message:
            'required variable is not declared in release profile requiredInputs',
          hint:
            'Declare every required non-image input so the release checklist matches the compose file.',
        });
      }
    }
    const used = new Set(parsed.requiredVars.map((variable) => variable.name));
    for (const variable of imageVars) {
      if (!used.has(variable)) {
        issues.push({
          severity: 'warning',
          line: 1,
          subject: `image-var-unused:${variable}`,
          message: 'release profile declares an image variable the compose does not use',
          hint: 'Remove the stale entry or wire it into the release compose.',
        });
      }
    }
    for (const variable of requiredInputs) {
      if (!used.has(variable)) {
        issues.push({
          severity: 'warning',
          line: 1,
          subject: `input-unused:${variable}`,
          message: 'release profile declares a required input the compose does not use',
          hint: 'Remove the stale entry or wire it into the release compose.',
        });
      }
    }
  }

  return issues;
}
