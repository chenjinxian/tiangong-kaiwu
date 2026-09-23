/**
 * Setup webhook subscription for web-agent
 */

const WEBHOOK_SECRET = 'your-webhook-signing-secret-change-in-production';
const WEB_AGENT_URL = 'http://localhost:4002/webhook';
const IMODELHUB_URL = 'http://localhost:4000';

async function getAuthToken(): Promise<string | null> {
  try {
    const response = await fetch(`${IMODELHUB_URL}/auth/email/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'Test123!@#',
      }),
    });

    if (!response.ok) {
      console.error('Login failed:', await response.text());
      return null;
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
}

async function createWebhookSubscription(token: string): Promise<void> {
  const response = await fetch(`${IMODELHUB_URL}/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      callbackUrl: WEB_AGENT_URL,
      eventTypes: [
        'iModels.iModelCreated.v1',
        'iModels.ChangesetPushed.v1',
        'iModels.NamedVersionCreated.v1',
        'iModels.BriefcaseAcquired.v1',
        'iModels.BriefcaseReleased.v1',
      ],
      scope: 'project',
      secret: WEBHOOK_SECRET,
      active: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to create webhook subscription:', error);
    return;
  }

  const data = await response.json();
  console.log('Webhook subscription created:', data);
}

async function listWebhookSubscriptions(token: string): Promise<void> {
  const response = await fetch(`${IMODELHUB_URL}/webhooks`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    console.error('Failed to list webhooks:', await response.text());
    return;
  }

  const data = await response.json();
  console.log('Existing webhooks:', JSON.stringify(data, null, 2));
}

async function triggerBaselineForExistingIModels(token: string): Promise<void> {
  // Get all projects
  const projectsResponse = await fetch(`${IMODELHUB_URL}/itwins?class=Project`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!projectsResponse.ok) {
    console.error('Failed to get projects');
    return;
  }

  const projects = await projectsResponse.json();

  for (const project of projects.iTwins || []) {
    // Get iModels for this project
    const imodelsResponse = await fetch(
      `${IMODELHUB_URL}/imodels?iTwinId=${project.id}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!imodelsResponse.ok) continue;

    const imodels = await imodelsResponse.json();

    for (const imodel of imodels.iModels || []) {
      console.log(`Checking iModel ${imodel.id}: state=${imodel.state}`);

      if (imodel.state === 'notInitialized' || !imodel.baselineBriefcaseId) {
        console.log(`  -> Triggering baseline generation for ${imodel.id}`);

        // Trigger webhook event manually
        const webhookResponse = await fetch(
          `${IMODELHUB_URL}/admin/webhook/trigger`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              eventType: 'iModels.iModelCreated.v1',
              iTwinId: project.id,
              content: {
                iModelId: imodel.id,
                iTwinId: project.id,
                needBaseline: true,
              },
            }),
          }
        );

        if (!webhookResponse.ok) {
          console.error(`  -> Failed to trigger webhook:`, await webhookResponse.text());
        } else {
          console.log(`  -> Webhook triggered successfully`);
        }
      }
    }
  }
}

async function main(): Promise<void> {
  console.log('Setting up webhook subscription...');

  const token = await getAuthToken();
  if (!token) {
    console.error('Failed to authenticate');
    process.exit(1);
  }

  console.log('Authenticated successfully');

  // List existing webhooks
  console.log('\nChecking existing webhooks...');
  await listWebhookSubscriptions(token);

  // Create webhook subscription
  console.log('\nCreating webhook subscription...');
  await createWebhookSubscription(token);

  // List again to confirm
  console.log('\nVerifying webhooks...');
  await listWebhookSubscriptions(token);

  // Check for uninitialized iModels
  console.log('\nChecking for uninitialized iModels...');
  await triggerBaselineForExistingIModels(token);

  console.log('\nDone!');
}

main().catch(console.error);
