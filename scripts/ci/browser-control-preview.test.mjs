import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('server-managed control is limited to staging and the approved audio test Preview', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/ci-deploy.yml', import.meta.url), 'utf8');
  const line = workflow.split(/\r?\n/).find(value => value.trimStart().startsWith('DEPLOY_BROWSER_CONTROL_ENABLED:'));
  assert.equal(line?.trim(), "DEPLOY_BROWSER_CONTROL_ENABLED: ${{ (github.ref == 'refs/heads/staging' || github.ref == 'refs/heads/feature/staging-meet-transcription') && 'true' || 'false' }}");
  assert.match(workflow, /--env "BROWSER_CONTROL_ENABLED=\$DEPLOY_BROWSER_CONTROL_ENABLED"/);
});
