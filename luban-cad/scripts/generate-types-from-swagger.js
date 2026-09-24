#!/usr/bin/env node
/**
 * Swagger to TypeScript Type Generator
 *
 * This script generates TypeScript types from imodelhub-services Swagger JSON
 * Usage: node generate-types-from-swagger.js
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SWAGGER_URL = 'http://localhost:4000/docs-json';
const OUTPUT_FILE = path.join(__dirname, '../packages/shared/src/generated/imodelhub-api.ts');

// Type mappings from OpenAPI to TypeScript
const typeMapping = {
  'string': 'string',
  'integer': 'number',
  'number': 'number',
  'boolean': 'boolean',
  'array': 'Array',
  'object': 'Record<string, unknown>',
};

// Schema name transformations
const nameTransformations = {
  // Rename confusing names
  'CreateiTwinDto': 'CreateITwinRequest',
  'UpdateiTwinDto': 'UpdateITwinRequest',
  'iTwinResponseDto': 'ITwin',
  'iTwinsListResponseDto': 'ITwinListResponse',
  'iTwinDetailResponseDto': 'ITwinDetailResponse',
  'CreateiModelDto': 'CreateIModelRequest',
  'iModelResponseDto': 'IModel',
  'CreateBriefcaseDto': 'CreateBriefcaseRequest',
  'BriefcaseResponseDto': 'Briefcase',
  'CreateChangesetDto': 'CreateChangesetRequest',
  'ChangesetResponseDto': 'Changeset',
  'CreateNamedVersionDto': 'CreateNamedVersionRequest',
  'NamedVersionResponseDto': 'NamedVersion',
  'LoginResponseDto': 'LoginResponse',
  'RefreshResponseDto': 'RefreshTokenResponse',
  'AuthEmailLoginDto': 'LoginRequest',
  'AuthRegisterLoginDto': 'RegisterRequest',
  'User': 'IModelHubUser',
};

// Field name transformations for consistency
const fieldNameTransformations = {
  // Map modeling-server field names to frontend convention
  'subClass': 'subclass',  // Backend uses subClass, we use subclass
  'createdBy': 'ownerId',  // Map to our convention
  'acquiredAt': 'acquiredDateTime',
  'pushDate': 'pushDateTime',
  'creatorId': 'userId',
};

/**
 * Convert OpenAPI schema to TypeScript interface
 */
function schemaToTypeScript(name, schema, required = []) {
  const lines = [];

  // Add JSDoc comment
  lines.push(`/**`);
  if (schema.description) {
    lines.push(` * ${schema.description}`);
  }
  lines.push(` * From Swagger: ${name}`);
  lines.push(` */`);

  // Determine if interface or type alias
  const isEnum = schema.enum;
  const isSimple = schema.type && !schema.properties && !schema.allOf && !schema.items;

  if (isEnum) {
    lines.push(`export type ${transformName(name)} = ${schema.enum.map(e => `'${e}'`).join(' | ')};`);
  } else if (isSimple) {
    const tsType = mapType(schema);
    lines.push(`export type ${transformName(name)} = ${tsType};`);
  } else {
    lines.push(`export interface ${transformName(name)} {`);

    // Handle allOf (inheritance)
    if (schema.allOf) {
      schema.allOf.forEach(ref => {
        if (ref.$ref) {
          const parentName = ref.$ref.split('/').pop();
          lines.push(`  // Extends ${transformName(parentName)}`);
        }
      });
    }

    // Handle properties
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([propName, propSchema]) => {
        const tsType = mapType(propSchema);
        const isOptional = !required.includes(propName) && !propSchema.required;
        const transformedName = transformFieldName(propName);
        const optionalMarker = isOptional ? '?' : '';
        lines.push(`  ${transformedName}${optionalMarker}: ${tsType};`);
      });
    }

    lines.push(`}`);
  }

  return lines.join('\n');
}

/**
 * Map OpenAPI type to TypeScript type
 */
function mapType(schema) {
  if (!schema) return 'unknown';

  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop();
    return transformName(refName);
  }

  // Handle array
  if (schema.type === 'array') {
    const itemType = mapType(schema.items);
    return `${itemType}[]`;
  }

  // Handle enum
  if (schema.enum) {
    return schema.enum.map(e => `'${e}'`).join(' | ');
  }

  // Handle object without properties (free-form)
  if (schema.type === 'object' && !schema.properties) {
    return 'Record<string, unknown>';
  }

  // Handle inline object
  if (schema.type === 'object' && schema.properties) {
    const props = Object.entries(schema.properties)
      .map(([key, val]) => `${key}?: ${mapType(val)}`)
      .join('; ');
    return `{ ${props} }`;
  }

  // Handle date-time format
  if (schema.format === 'date-time') {
    return 'string'; // ISO 8601 date string
  }

  // Handle uuid format
  if (schema.format === 'uuid') {
    return 'string'; // UUID string
  }

  // Map basic types
  return typeMapping[schema.type] || 'unknown';
}

/**
 * Transform schema name
 */
function transformName(name) {
  return nameTransformations[name] || name;
}

/**
 * Transform field name for consistency
 */
function transformFieldName(name) {
  return fieldNameTransformations[name] || name;
}

/**
 * Fetch Swagger JSON
 */
async function fetchSwagger() {
  try {
    const response = await fetch(SWAGGER_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching Swagger:', error.message);
    console.log('Make sure imodelhub-services is running on', SWAGGER_URL);
    process.exit(1);
  }
}

/**
 * Main generation function
 */
async function generate() {
  console.log('Fetching Swagger JSON from', SWAGGER_URL);
  const swagger = await fetchSwagger();

  console.log('Generating TypeScript types...');

  const output = [];

  // Header
  output.push(`/**`);
  output.push(` * Auto-generated TypeScript types from imodelhub-services Swagger`);
  output.push(` * Generated at: ${new Date().toISOString()}`);
  output.push(` * Source: ${SWAGGER_URL}`);
  output.push(` * DO NOT EDIT THIS FILE MANUALLY`);
  output.push(` */`);
  output.push('');

  // Generate types for each schema
  if (swagger.components && swagger.components.schemas) {
    const schemas = swagger.components.schemas;

    // Sort schemas for consistent output
    const sortedNames = Object.keys(schemas).sort();

    // Group by category
    const categories = {
      'Auth': [],
      'User': [],
      'iTwin': [],
      'iModel': [],
      'Briefcase': [],
      'Changeset': [],
      'NamedVersion': [],
      'Lock': [],
      'Webhook': [],
      'Other': [],
    };

    sortedNames.forEach(name => {
      const lowerName = name.toLowerCase();
      if (lowerName.includes('auth') || lowerName.includes('login')) {
        categories['Auth'].push(name);
      } else if (lowerName.includes('user')) {
        categories['User'].push(name);
      } else if (lowerName.includes('itwin')) {
        categories['iTwin'].push(name);
      } else if (lowerName.includes('imodel')) {
        categories['iModel'].push(name);
      } else if (lowerName.includes('briefcase')) {
        categories['Briefcase'].push(name);
      } else if (lowerName.includes('changeset')) {
        categories['Changeset'].push(name);
      } else if (lowerName.includes('named') || lowerName.includes('version')) {
        categories['NamedVersion'].push(name);
      } else if (lowerName.includes('lock')) {
        categories['Lock'].push(name);
      } else if (lowerName.includes('webhook')) {
        categories['Webhook'].push(name);
      } else {
        categories['Other'].push(name);
      }
    });

    // Generate for each category
    Object.entries(categories).forEach(([category, names]) => {
      if (names.length === 0) return;

      output.push(`// =============================================================================`);
      output.push(`// ${category} Types`);
      output.push(`// =============================================================================`);
      output.push('');

      names.forEach(name => {
        const schema = schemas[name];
        const tsCode = schemaToTypeScript(name, schema, schema.required || []);
        output.push(tsCode);
        output.push('');
      });
    });
  }

  // Write output
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, output.join('\n'));
  console.log(`Types written to: ${OUTPUT_FILE}`);
}

// Run
console.log('Swagger Type Generator');
console.log('======================');
generate().catch(console.error);
