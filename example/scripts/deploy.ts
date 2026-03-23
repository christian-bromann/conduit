/**
 * LangSmith Cloud deployment script using the Control Plane API.
 *
 * Required environment variables:
 *   LANGSMITH_API_KEY              – LangSmith API key with deployment permissions
 *   LANGSMITH_WORKSPACE_ID        – Target workspace ID
 *   LANGSMITH_GIT_INTEGRATION_ID  – GitHub integration ID from LangSmith
 *   GITHUB_REPOSITORY             – owner/repo (set automatically in GitHub Actions)
 *
 * Optional:
 *   LANGSMITH_DEPLOYMENT_NAME     – Override the deployment name (default: "conduit")
 *   LANGSMITH_REPO_REF            – Git ref to deploy (default: "main")
 *   LANGSMITH_CONTROL_PLANE_HOST  – Control plane host (default: "https://api.host.langchain.com")
 *   ANTHROPIC_API_KEY             – Passed as a deployment secret
 *   SLACK_BOT_TOKEN               – Passed as a deployment secret
 *   SLACK_SIGNING_SECRET          – Passed as a deployment secret
 *   WHATSAPP_ACCESS_TOKEN         – Passed as a deployment secret
 *   WHATSAPP_PHONE_NUMBER_ID      – Passed as a deployment secret
 *   WHATSAPP_VERIFY_TOKEN         – Passed as a deployment secret
 *   META_APP_SECRET               – Passed as a deployment secret
 *
 * Usage:
 *   bun ./scripts/deploy.ts            # deploy and wait
 *   bun ./scripts/deploy.ts --no-wait  # deploy without waiting
 */

const CONTROL_PLANE_HOST =
  process.env.LANGSMITH_CONTROL_PLANE_HOST ?? 'https://api.host.langchain.com';
const API_KEY = process.env.LANGSMITH_API_KEY;
const WORKSPACE_ID = process.env.LANGSMITH_WORKSPACE_ID;
const INTEGRATION_ID = process.env.LANGSMITH_GIT_INTEGRATION_ID;
const REPO = process.env.GITHUB_REPOSITORY;
const DEPLOYMENT_NAME = process.env.LANGSMITH_DEPLOYMENT_NAME ?? 'conduit';
const REPO_REF = process.env.LANGSMITH_REPO_REF ?? 'main';
const LANGGRAPH_CONFIG_PATH = 'example/langgraph.json';
const MAX_WAIT_SECONDS = 1800;

const SECRET_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'META_APP_SECRET',
  'DISCORD_APPLICATION_ID',
  'DISCORD_PUBLIC_KEY',
] as const;

function required(name: string, value: string | undefined): string {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const apiKey = required('LANGSMITH_API_KEY', API_KEY);
const workspaceId = required('LANGSMITH_WORKSPACE_ID', WORKSPACE_ID);
const repoUrl = REPO ? `https://github.com/${REPO}` : '';

const headers: Record<string, string> = {
  'X-Api-Key': apiKey,
  'X-Tenant-Id': workspaceId,
  'Content-Type': 'application/json',
};

async function request(method: string, path: string, body?: unknown): Promise<Response> {
  const url = `${CONTROL_PLANE_HOST}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

interface Deployment {
  id: string;
  name: string;
  latest_revision_id?: string;
}

interface RevisionList {
  resources: Array<{ id: string; status: string }>;
}

function collectSecrets(): Array<{ name: string; value: string }> {
  const secrets: Array<{ name: string; value: string }> = [];
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (value) {
      secrets.push({ name, value });
    }
  }
  return secrets;
}

async function findDeployment(): Promise<Deployment | null> {
  const res = await request('GET', `/v2/deployments?name_contains=${DEPLOYMENT_NAME}`);
  if (!res.ok) {
    console.error(`Failed to list deployments: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as { resources?: Deployment[] };
  const match = data.resources?.find((d) => d.name === DEPLOYMENT_NAME);
  return match ?? null;
}

async function createDeployment(): Promise<Deployment> {
  const integrationId = required('LANGSMITH_GIT_INTEGRATION_ID', INTEGRATION_ID);
  if (!repoUrl) {
    console.error('Missing required environment variable: GITHUB_REPOSITORY');
    process.exit(1);
  }

  const secrets = collectSecrets();

  const body = {
    name: DEPLOYMENT_NAME,
    source: 'github',
    source_config: {
      integration_id: integrationId,
      repo_url: repoUrl,
      deployment_type: 'dev',
      build_on_push: true,
    },
    source_revision_config: {
      repo_ref: REPO_REF,
      langgraph_config_path: LANGGRAPH_CONFIG_PATH,
    },
    ...(secrets.length > 0 ? { secrets } : {}),
  };

  console.log(`Creating deployment "${DEPLOYMENT_NAME}" from ${repoUrl}@${REPO_REF}`);
  if (secrets.length > 0) {
    console.log(`  with secrets: ${secrets.map((s) => s.name).join(', ')}`);
  }

  const res = await request('POST', '/v2/deployments', body);
  if (!res.ok) {
    console.error(`Failed to create deployment: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return (await res.json()) as Deployment;
}

async function updateDeployment(deploymentId: string): Promise<Deployment> {
  const body = {
    source_config: {
      build_on_push: true,
    },
    source_revision_config: {
      repo_ref: REPO_REF,
      langgraph_config_path: LANGGRAPH_CONFIG_PATH,
    },
  };

  console.log(`Updating deployment "${DEPLOYMENT_NAME}" (${deploymentId})`);
  const res = await request('PATCH', `/v2/deployments/${deploymentId}`, body);
  if (!res.ok) {
    console.error(`Failed to update deployment: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  return (await res.json()) as Deployment;
}

async function getLatestRevisionId(deploymentId: string): Promise<string> {
  const res = await request('GET', `/v2/deployments/${deploymentId}/revisions`);
  if (!res.ok) {
    console.error(`Failed to list revisions: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const data = (await res.json()) as RevisionList;
  if (!data.resources[0]) {
    console.error(`No revisions found for deployment: ${deploymentId}`);
    process.exit(1);
  }
  return data.resources[0].id;
}

async function waitForDeployment(deploymentId: string, revisionId: string): Promise<void> {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < MAX_WAIT_SECONDS) {
    const res = await request('GET', `/v2/deployments/${deploymentId}/revisions/${revisionId}`);
    if (!res.ok) {
      console.error(`Failed to get revision: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const revision = (await res.json()) as { status: string };
    const status = revision.status;

    if (status === 'DEPLOYED') {
      console.log(`Revision ${revisionId} is DEPLOYED`);
      return;
    }
    if (status.includes('FAILED')) {
      console.error(`Revision ${revisionId} failed with status: ${status}`);
      process.exit(1);
    }

    console.log(`Revision status: ${status} — waiting...`);
    await Bun.sleep(30_000);
  }

  console.error(`Timeout: deployment did not complete within ${MAX_WAIT_SECONDS}s`);
  process.exit(1);
}

async function main() {
  const skipWait = process.argv.includes('--no-wait');

  let deployment = await findDeployment();
  let revisionId: string;

  if (deployment) {
    console.log(`Found existing deployment: ${deployment.id}`);
    deployment = await updateDeployment(deployment.id);
    revisionId = await getLatestRevisionId(deployment.id);
  } else {
    console.log('No existing deployment found, creating new one...');
    deployment = await createDeployment();
    revisionId = await getLatestRevisionId(deployment.id);
  }

  console.log(`Deployment ID: ${deployment.id}`);
  console.log(`Revision ID:   ${revisionId}`);

  if (skipWait) {
    console.log('Skipping wait (--no-wait flag set)');
  } else {
    await waitForDeployment(deployment.id, revisionId);
    console.log('Deployment complete!');
  }
}

main();
