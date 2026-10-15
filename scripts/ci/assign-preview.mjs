import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewHost } from './preview-host.mjs';

export async function assignPreview({ repository, branch, deploymentUrl, teamId, token, request = fetch }) {
  const host = previewHost(repository, branch);
  const deployment = new URL(deploymentUrl);
  if (deployment.protocol !== 'https:' || !deployment.hostname.endsWith('.vercel.app') || deployment.username || deployment.password) {
    throw new Error('Expected a Vercel deployment URL');
  }
  if (!teamId?.startsWith('team_') || !token) throw new Error('Missing Vercel team or token');
  const endpoint = new URL(`https://api.vercel.com/v2/deployments/${encodeURIComponent(deployment.hostname)}/aliases`);
  endpoint.searchParams.set('teamId', teamId);
  const response = await request(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias: host }),
    signal: AbortSignal.timeout(20000),
  });
  // Do not print response bodies, request headers, or secrets on API errors.
  if (!response.ok) throw new Error(`Preview alias assignment failed (HTTP ${response.status})`);
  const result = await response.json();
  if (result.alias !== host) throw new Error('Vercel returned an unexpected Preview alias');
  return `https://${host}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = await assignPreview({
    repository: process.env.GITHUB_REPOSITORY,
    branch: process.env.GITHUB_REF_NAME,
    deploymentUrl: process.env.DEPLOYMENT_URL,
    teamId: process.env.VERCEL_ORG_ID,
    token: process.env.VERCEL_TOKEN,
  });
  console.log(`Branch Preview: ${url}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n### Branch Preview\n${url}\n`);
  }
}
