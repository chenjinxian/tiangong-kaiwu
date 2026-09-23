/**
 * Check iModel status and trigger baseline if needed
 */

const IMODELHUB_URL = 'http://localhost:4000';
const WEB_AGENT_URL = 'http://localhost:4002';

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

  // Get all projects
  const projectsResponse = await fetch(`${IMODELHUB_URL}/itwins?class=Project`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!projectsResponse.ok) {
    console.error('Failed to get projects');
    return;
  }

  const projects = await projectsResponse.json();

  console.log('=== Checking all iModels ===\n');

  for (const project of projects.iTwins || []) {
    console.log(`Project: ${project.displayName} (${project.id})`);

    const imodelsResponse = await fetch(
      `${IMODELHUB_URL}/imodels?iTwinId=${project.id}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!imodelsResponse.ok) continue;

    const imodels = await imodelsResponse.json();

    for (const imodel of imodels.iModels || []) {
      console.log(`\n  iModel: ${imodel.name}`);
      console.log(`    ID: ${imodel.id}`);
      console.log(`    State: ${imodel.state}`);
      console.log(`    Baseline Briefcase ID: ${imodel.baselineBriefcaseId || 'N/A'}`);

      // Check baseline status
      const baselineResponse = await fetch(
        `${IMODELHUB_URL}/imodels/${imodel.id}/baseline`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (baselineResponse.ok) {
        const baseline = await baselineResponse.json();
        console.log(`    Baseline State: ${baseline.state}`);
        console.log(`    Baseline File Size: ${baseline.fileSize}`);
      } else {
        console.log(`    Baseline: Not found`);
      }

      // If not initialized, trigger baseline
      if (imodel.state === 'notInitialized' || !imodel.baselineBriefcaseId) {
        console.log(`\n    ⚠️  iModel ${imodel.name} needs baseline!`);
        console.log(`    Triggering baseline generation...`);

        const retryResponse = await fetch(
          `${WEB_AGENT_URL}/baseline/retry/${imodel.id}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              iTwinId: project.id,
              imodelName: imodel.name,
            }),
          }
        );

        if (retryResponse.ok) {
          console.log(`    ✅ Baseline retry triggered:`, await retryResponse.json());
        } else {
          console.error(`    ❌ Failed:`, await retryResponse.text());
        }
      }
    }
    console.log('');
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);
