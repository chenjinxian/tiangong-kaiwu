#!/usr/bin/env node
/**
 * Open Cloud CAD Configuration Verification Script
 * Verifies imodelhub-services configuration is correct
 */

const fs = require('fs');
const path = require('path');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   Open Cloud CAD Configuration Verification                  ║');
console.log('║   imodelhub-services Mode                                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const checks = [];

// Check 1: Backend .env file exists
const backendEnvPath = path.join(__dirname, '../apps/backend/.env');
const backendEnvExamplePath = path.join(__dirname, '../apps/backend/.env.example');
const backendEnvExists = fs.existsSync(backendEnvPath);

checks.push({
  name: 'Backend .env file',
  status: backendEnvExists ? 'PASS' : 'WARN',
  message: backendEnvExists
    ? 'Found apps/backend/.env'
    : 'Not found. Copy from .env.example: cp apps/backend/.env.example apps/backend/.env'
});

// Check 2: Web .env file exists
const webEnvPath = path.join(__dirname, '../apps/web/.env');
const webEnvExamplePath = path.join(__dirname, '../apps/web/.env.example');
const webEnvExists = fs.existsSync(webEnvPath);

checks.push({
  name: 'Web .env file',
  status: webEnvExists ? 'PASS' : 'WARN',
  message: webEnvExists
    ? 'Found apps/web/.env'
    : 'Not found. Copy from .env.example: cp apps/web/.env.example apps/web/.env'
});

// Check 3: Backend configuration
if (backendEnvExists) {
  const backendEnv = fs.readFileSync(backendEnvPath, 'utf8');

  const hasIModelHubUrl = backendEnv.includes('IMODELHUB_URL=');
  const hasAzuriteUrl = backendEnv.includes('AZURITE_URL=');
  const hasWebhookSecret = backendEnv.includes('WEBHOOK_SECRET=') &&
    !backendEnv.includes('WEBHOOK_SECRET=your-webhook-secret');

  checks.push({
    name: 'Backend IMODELHUB_URL',
    status: hasIModelHubUrl ? 'PASS' : 'FAIL',
    message: hasIModelHubUrl ? 'Configured' : 'Missing IMODELHUB_URL'
  });

  checks.push({
    name: 'Backend AZURITE_URL',
    status: hasAzuriteUrl ? 'PASS' : 'FAIL',
    message: hasAzuriteUrl ? 'Configured' : 'Missing AZURITE_URL'
  });

  checks.push({
    name: 'Backend WEBHOOK_SECRET',
    status: hasWebhookSecret ? 'PASS' : 'WARN',
    message: hasWebhookSecret
      ? 'Custom secret configured'
      : 'Using default secret - change for production!'
  });

  // Check for Bentley URL (should NOT be present)
  const hasBentleyUrl = backendEnv.includes('api.bentley.com');
  checks.push({
    name: 'No Bentley API references',
    status: !hasBentleyUrl ? 'PASS' : 'FAIL',
    message: !hasBentleyUrl
      ? 'No Bentley URLs found - correct!'
      : 'Found api.bentley.com - should use imodelhub-services!'
  });
}

// Check 4: Web configuration
if (webEnvExists) {
  const webEnv = fs.readFileSync(webEnvPath, 'utf8');

  const hasApiUrl = webEnv.includes('VITE_API_URL=');
  const hasIModelHubUrl = webEnv.includes('VITE_IMODELHUB_URL=');
  const hasAzuriteUrl = webEnv.includes('VITE_AZURITE_URL=');

  checks.push({
    name: 'Web VITE_API_URL',
    status: hasApiUrl ? 'PASS' : 'FAIL',
    message: hasApiUrl ? 'Configured' : 'Missing VITE_API_URL'
  });

  checks.push({
    name: 'Web VITE_IMODELHUB_URL',
    status: hasIModelHubUrl ? 'PASS' : 'FAIL',
    message: hasIModelHubUrl ? 'Configured' : 'Missing VITE_IMODELHUB_URL'
  });

  checks.push({
    name: 'Web VITE_AZURITE_URL',
    status: hasAzuriteUrl ? 'PASS' : 'WARN',
    message: hasAzuriteUrl ? 'Configured' : 'Missing (optional)'
  });

  // Check for Bentley URL (should NOT be present)
  const hasBentleyUrl = webEnv.includes('api.bentley.com') ||
    webEnv.includes('ims.bentley.com');
  checks.push({
    name: 'No Bentley API references (Web)',
    status: !hasBentleyUrl ? 'PASS' : 'FAIL',
    message: !hasBentleyUrl
      ? 'No Bentley URLs found - correct!'
      : 'Found Bentley URLs - should use imodelhub-services!'
  });
}

// Check 5: Backend main.ts configuration
const backendMainPath = path.join(__dirname, '../apps/backend/src/main.ts');
if (fs.existsSync(backendMainPath)) {
  const mainContent = fs.readFileSync(backendMainPath, 'utf8');

  const hasIModelHubUrl = mainContent.includes('IMODELHUB_URL');
  const hasAzuriteUrl = mainContent.includes('AZURITE_URL');
  const usesIModelHubEndpoint = mainContent.includes('${IMODELHUB_URL}/imodels');

  checks.push({
    name: 'Backend code: IMODELHUB_URL variable',
    status: hasIModelHubUrl ? 'PASS' : 'FAIL',
    message: hasIModelHubUrl ? 'Found' : 'Not found in main.ts'
  });

  checks.push({
    name: 'Backend code: Azurite configuration',
    status: hasAzuriteUrl ? 'PASS' : 'WARN',
    message: hasAzuriteUrl ? 'Found' : 'AZURITE_URL not used in code'
  });

  checks.push({
    name: 'Backend code: Uses imodelhub-services endpoint',
    status: usesIModelHubEndpoint ? 'PASS' : 'FAIL',
    message: usesIModelHubEndpoint
      ? 'Correctly uses ${IMODELHUB_URL}/imodels'
      : 'Not using imodelhub-services endpoint!'
  });
}

// Print results
console.log('Configuration Checks:');
console.log('────────────────────────────────────────────────────────────────\n');

let passCount = 0;
let warnCount = 0;
let failCount = 0;

checks.forEach(check => {
  const symbol = check.status === 'PASS' ? '✅' :
    check.status === 'WARN' ? '⚠️' : '❌';
  console.log(`${symbol} [${check.status}] ${check.name}`);
  console.log(`   ${check.message}\n`);

  if (check.status === 'PASS') passCount++;
  else if (check.status === 'WARN') warnCount++;
  else failCount++;
});

console.log('────────────────────────────────────────────────────────────────');
console.log(`\nResults: ${passCount} passed, ${warnCount} warnings, ${failCount} failed\n`);

// Print service URLs
console.log('Configured Service URLs:');
console.log('────────────────────────────────────────────────────────────────');

if (backendEnvExists) {
  const backendEnv = fs.readFileSync(backendEnvPath, 'utf8');
  const imodelhubMatch = backendEnv.match(/IMODELHUB_URL=(.+)/);
  const azuriteMatch = backendEnv.match(/AZURITE_URL=(.+)/);

  console.log(`IModelHub Services: ${imodelhubMatch ? imodelhubMatch[1].trim() : 'Not configured'}`);
  console.log(`Azurite Storage:    ${azuriteMatch ? azuriteMatch[1].trim() : 'Not configured'}`);
} else {
  console.log('IModelHub Services: http://localhost:4000 (default)');
  console.log('Azurite Storage:    http://localhost:10000 (default)');
}

console.log('\nBackend API:        http://localhost:4001 (default)');
console.log('Web Frontend:       http://localhost:3000');

// Print next steps
console.log('\n────────────────────────────────────────────────────────────────');
console.log('Next Steps:');
console.log('────────────────────────────────────────────────────────────────\n');

if (failCount > 0) {
  console.log('1. Fix FAILED checks above');
}

if (!backendEnvExists) {
  console.log('1. Create backend .env:');
  console.log('   cp apps/backend/.env.example apps/backend/.env');
}

if (!webEnvExists) {
  console.log('2. Create web .env:');
  console.log('   cp apps/web/.env.example apps/web/.env');
}

console.log('\n3. Start required services:');
console.log('   # Terminal 1: Start azurite');
console.log('   docker run -d -p 10000:10000 mcr.microsoft.com/azure-storage/azurite:latest');
console.log('');
console.log('   # Terminal 2: Start imodelhub-services');
console.log('   cd /path/to/imodelhub-services && npm run start:dev');
console.log('');
console.log('   # Terminal 3: Start Open Cloud CAD backend');
console.log('   cd apps/backend && npm run dev');
console.log('');
console.log('   # Terminal 4: Start web frontend');
console.log('   cd apps/web && npm run dev');

console.log('\n4. Verify services are running:');
console.log('   curl http://localhost:4000/health    # imodelhub-services');
console.log('   curl http://localhost:4001/health    # backend');
console.log('   curl http://localhost:10000/devstoreaccount1?comp=list  # azurite');

console.log('\n────────────────────────────────────────────────────────────────\n');

process.exit(failCount > 0 ? 1 : 0);
