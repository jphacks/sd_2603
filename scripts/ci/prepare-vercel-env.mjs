import { readFile, writeFile } from 'node:fs/promises';

const target = process.argv[2];
if (!['preview', 'production'].includes(target)) {
  throw new Error('Expected preview or production');
}
// The build and local smoke test use Mock without paid API calls. Deployment
// runtime settings are selected separately in ci-deploy.yml. Never log secrets.
const path = `.vercel/.env.${target}.local`;
const original = await readFile(path, 'utf8');
const lines = original.split(/\r?\n/).filter(line =>
  !/^\s*(?:export\s+)?(?:AI_PROVIDER|ALLOW_PAID_AI)\s*=/.test(line),
);
await writeFile(path, `${lines.join('\n')}\nAI_PROVIDER="mock"\nALLOW_PAID_AI="false"\n`, { mode: 0o600 });
console.log(`Mock-only build environment prepared for ${target}.`);
