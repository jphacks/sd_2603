import { readFile, appendFile } from 'node:fs/promises';

const result = JSON.parse(await readFile(process.argv[2], 'utf8'));
const deployment = result.deployment ?? result;
if (!deployment.url) throw new Error('Vercel returned no deployment URL');
const urls = [...new Set([deployment.url, deployment.productionUrl].filter(Boolean))];
if (urls.length === 0) throw new Error('Vercel returned no deployment URL');
for (const value of urls) {
  const url = new URL(value.startsWith('https://') ? value : `https://${value}`);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app') || url.username || url.password) {
    throw new Error('Unexpected Vercel deployment URL');
  }
  const line = `- ${url.href}\n`;
  console.log(`Deployment ready: ${url.href}`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, line);
  if (value === deployment.url && process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `deployment_url=${url.href}\n`);
  }
}
