/**
 * Regenerate baseline for existing iModel
 */

const IMODELHUB_URL = 'http://localhost:4000';
const WEBHOOK_AGENT_URL = 'http://localhost:4002';

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

async function main(): Promise<void> {
  const token = await getAuthToken();
  if (!token) {
    console.error('Failed to authenticate');
    process.exit(1);
  }

  // Get project and iModel
  const projectsResponse = await fetch(`${IMODELHUB_URL}/itwins?class=Project`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!projectsResponse.ok) {
    console.error('Failed to get projects');
    return;
  }

  const projects = await projectsResponse.json();
  if (!projects.iTwins?.length) {
    console.log('No projects found');
    return;
  }

  const projectId = projects.iTwins[0].id;

  const imodelsResponse = await fetch(`${IMODELHUB_URL}/imodels?iTwinId=${projectId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!imodelsResponse.ok) {
    console.error('Failed to get iModels');
    return;
  }

  const imodels = await imodelsResponse.json();
  if (!imodels.iModels?.length) {
    console.log('No iModels found');
    return;
  }

  const imodel = imodels.iModels[0];
  console.log(`Found iModel: ${imodel.id}`);
  console.log(`Current state: ${imodel.state}`);
  console.log(`Baseline briefcase ID: ${imodel.baselineBriefcaseId}`);

  // Get baseline status
  const baselineResponse = await fetch(`${IMODELHUB_URL}/imodels/${imodel.id}/baseline`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (baselineResponse.ok) {
    const baseline = await baselineResponse.json();
    console.log('Baseline status:', baseline);
  } else {
    console.log('No baseline found');
  }

  // Try to trigger baseline retry via webhook-agent
  console.log('\nTriggering baseline retry via webhook-agent...');

  const retryResponse = await fetch(`${WEBHOOK_AGENT_URL}/baseline/retry/${imodel.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      iTwinId: projectId,
      imodelName: imodel.name,
    }),
  });

  if (retryResponse.ok) {
    console.log('Baseline retry triggered:', await retryResponse.json());
  } else {
    console.error('Failed to trigger retry:', await retryResponse.text());
  }

  console.log('\nDone! Check webhook-agent logs for progress.');
}

main().catch(console.error);
