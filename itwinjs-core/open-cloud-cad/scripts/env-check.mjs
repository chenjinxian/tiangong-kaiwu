#!/usr/bin/env node
/**
 * Environment Check Script
 * Checks if all required services are available
 */

const checks = [
  { name: 'PostgreSQL', port: 5432, required: true },
  { name: 'Azurite (Blob)', port: 10000, required: true },
  { name: 'imodelhub-services', port: 4000, required: true },
  { name: 'Open Cloud CAD Backend', port: 4001, required: true },
  { name: 'Open Cloud CAD Web', port: 5173, required: false }
];

console.log('🔍 Checking Environment...\n');
console.log('Service                Port    Status');
console.log('────────────────────────────────────────');

for (const check of checks) {
  try {
    const response = await fetch(`http://localhost:${check.port}/health`)
      .catch(() => fetch(`http://localhost:${check.port}`));

    if (response?.ok) {
      console.log(`✅ ${check.name.padEnd(20)} ${check.port}    RUNNING`);
    } else {
      throw new Error('Not responding');
    }
  } catch (error) {
    const required = check.required ? '❌ REQUIRED' : '⚠️  Optional';
    console.log(`❌ ${check.name.padEnd(20)} ${check.port}    ${required}`);
  }
}

console.log('\n📋 Requirements:');
console.log('   • Docker Desktop - For PostgreSQL and Azurite');
console.log('   • imodelhub-services - Backend API service');
console.log('   • Open Cloud CAD backend - RPC and WebSocket service');
console.log('   • Open Cloud CAD web - Frontend (optional for API tests)');
