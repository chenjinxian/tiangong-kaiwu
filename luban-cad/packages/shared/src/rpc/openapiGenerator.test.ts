/**
 * Copyright (c) LubanCAD. All rights reserved.
 * Licensed under the MIT License.
 *
 * Tests for the OpenAPI contract generator (repo-root scripts/generate-openapi.ts).
 * Fixture interfaces are written to a temp dir and parsed via the TypeScript
 * Compiler API — no dependency on the real RpcInterface sources.
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { generateOpenApiFromFiles } from '../../../../../scripts/generate-openapi.js';

const FIXTURE_TYPES = `
export interface WidgetDto {
  id: string;
  size: number;
  tags?: string[];
}
`;

const FIXTURE_IFACE = `
import { RpcInterface } from '@itwin/core-common';
import type { WidgetDto } from './fixture-types.js';

export type WidgetKind = 'alpha' | 'beta';

export abstract class FixtureRpcInterface extends RpcInterface {
  public static readonly interfaceName = 'FixtureRpcInterface';
  public static interfaceVersion = '2.1.0';

  public static getClient(): FixtureRpcInterface { return null as never; }

  /** Create a widget */
  public async createWidget(_name: string, _kind: WidgetKind, _payload: WidgetDto): Promise<WidgetDto> {
    return this.forward(arguments);
  }

  /** List all widgets */
  public async listWidgets(): Promise<WidgetDto[]> {
    return this.forward(arguments);
  }

  /** Delete a widget */
  public async deleteWidget(_id: string): Promise<void> {
    return this.forward(arguments);
  }
}
`;

function writeFixture(dir: string, name: string, content: string): string {
  const file = join(dir, name);
  writeFileSync(file, content, 'utf8');
  return file;
}

describe('generateOpenApiFromFiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'luban-openapi-'));
  const typesFile = writeFixture(dir, 'fixture-types.ts', FIXTURE_TYPES);
  const ifaceFile = writeFixture(dir, 'fixture-iface.ts', FIXTURE_IFACE);
  const doc = generateOpenApiFromFiles([ifaceFile, typesFile]);

  it('emits one path per RpcInterface method', () => {
    const pathKeys = Object.keys(doc.paths);
    expect(pathKeys).toHaveLength(3);
    expect(pathKeys).toContain('/FixtureRpcInterface-2.1.0/createWidget');
    expect(pathKeys).toContain('/FixtureRpcInterface-2.1.0/listWidgets');
    expect(pathKeys).toContain('/FixtureRpcInterface-2.1.0/deleteWidget');
  });

  it('uses the interfaceName-interfaceVersion path shape', () => {
    for (const key of Object.keys(doc.paths)) {
      expect(key.startsWith('/FixtureRpcInterface-2.1.0/')).toBe(true);
    }
  });

  it('maps primitive params and literal-union params', () => {
    const op = doc.paths['/FixtureRpcInterface-2.1.0/createWidget'].post!;
    const items = op.requestBody!.content['application/json'].schema as {
      type: string;
      items: { anyOf: Array<Record<string, unknown>> };
    };
    expect(items.type).toBe('array');
    expect(items.items.anyOf[0]).toEqual({ type: 'string' });
    expect(items.items.anyOf[1]).toEqual({ type: 'string', enum: ['alpha', 'beta'] });
    expect(items.items.anyOf[2]).toEqual({ $ref: '#/components/schemas/WidgetDto' });
  });

  it('expands cross-file DTO types into components schemas', () => {
    const widget = doc.components!.schemas!.WidgetDto as {
      type: string;
      properties: Record<string, { type?: string; items?: { type?: string } }>;
      required: string[];
    };
    expect(widget.type).toBe('object');
    expect(widget.properties.id).toEqual({ type: 'string' });
    expect(widget.properties.size).toEqual({ type: 'number' });
    expect(widget.properties.tags).toEqual({ type: 'array', items: { type: 'string' } });
    expect(widget.required).toEqual(['id', 'size']);
  });

  it('maps array return types and $ref items', () => {
    const op = doc.paths['/FixtureRpcInterface-2.1.0/listWidgets'].post!;
    const ok = op.responses['200'] as { content: Record<string, { schema: Record<string, unknown> }> };
    expect(ok.content['application/json'].schema).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/WidgetDto' },
    });
  });

  it('maps void returns to an empty 200 response', () => {
    const op = doc.paths['/FixtureRpcInterface-2.1.0/deleteWidget'].post!;
    const ok = op.responses['200'] as { description: string; content?: unknown };
    expect(ok.description).toBe('Success');
    expect(ok.content).toBeUndefined();
  });

  it('carries the JSDoc summary into the operation', () => {
    const op = doc.paths['/FixtureRpcInterface-2.1.0/createWidget'].post!;
    expect(op.summary).toBe('Create a widget');
    expect(op.operationId).toBe('FixtureRpcInterface-2.1.0-createWidget');
  });

  it('strips the leading underscore from param names', () => {
    const op = doc.paths['/FixtureRpcInterface-2.1.0/deleteWidget'].post!;
    expect(op.requestBody!.description).toBe('Positional parameters: id');
  });
});
