/**
 * Test webhook signature validation
 */

const crypto = require('crypto');

// Secrets from both services
const imodelhubSecret = 'your-webhook-signing-secret-change-in-production';
const webagentSecret = 'your-webhook-signing-secret-change-in-production';

// Test payload
const payload = JSON.stringify({
  eventType: 'iModels.iModelCreated.v1',
  iModelId: 'test-imodel-id',
  iTwinId: 'test-itwin-id'
});

// Generate signature (how imodelhub-services does it)
const signature = crypto
  .createHmac('sha256', imodelhubSecret)
  .update(payload, 'utf-8')
  .digest('hex');

console.log('Generated signature:', signature);
console.log('Signature header:', `sha256=${signature}`);

// Verify signature (how webhook-agent does it)
const expectedSignature = crypto
  .createHmac('sha256', webagentSecret)
  .update(payload, 'utf-8')
  .digest('hex');

console.log('Expected signature:', expectedSignature);
console.log('Match:', signature === expectedSignature);

// Test with mismatched secrets
const wrongSecret = 'test-webhook-secret-for-manual-testing';
const wrongSignature = crypto
  .createHmac('sha256', wrongSecret)
  .update(payload, 'utf-8')
  .digest('hex');

console.log('\nWith wrong secret:');
console.log('Generated:', signature);
console.log('Expected:', wrongSignature);
console.log('Match:', signature === wrongSignature);
