import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function previewHost(repository, branch) {
  if (!repository || !branch || (branch !== 'staging' && !branch.startsWith('feature/'))) {
    throw new Error('Expected a repository and a feature/* or staging branch');
  }
  const slug = branch.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24).replace(/-$/, '');
  const hash = createHash('sha256').update(`${repository}\0${branch}`).digest('hex').slice(0, 12);
  return `meeting-facilitator-${slug}-${hash}.vercel.app`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(previewHost(process.env.GITHUB_REPOSITORY, process.env.GITHUB_REF_NAME));
}
