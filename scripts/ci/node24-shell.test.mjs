import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, link, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const helper = fileURLToPath(new URL('../use-node24.ps1', import.meta.url));
const pinned = (await readFile(new URL('../../.nvmrc', import.meta.url), 'utf8')).trim();
const windows = process.platform === 'win32';
const quote = value => `'${value.replaceAll("'", "''")}'`;

async function fixture({ version = pinned, runtime = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'node24-shell-'));
  await mkdir(join(directory, 'scripts'));
  const script = join(directory, 'scripts/use-node24.ps1');
  await copyFile(helper, script);
  await writeFile(join(directory, '.nvmrc'), version);
  const binaryDirectory = join(directory, `.recall/runtime/node-v${version}-win-x64`);
  if (runtime) {
    await mkdir(binaryDirectory, { recursive: true });
    // The fixture never downloads or substitutes an executable. Link/copy the
    // exact Node running this test; only its --version command is invoked.
    await link(process.execPath, join(binaryDirectory, 'node.exe')).catch(() => copyFile(process.execPath, join(binaryDirectory, 'node.exe')));
    await copyFile(join(dirname(process.execPath), 'npm.cmd'), join(binaryDirectory, 'npm.cmd'));
  }
  return { script, binaryDirectory, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

function powershell(code) {
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; ${code}`,
  ], { encoding: 'utf8', timeout: 30_000, cwd: tmpdir() });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

test('shared Windows activation is version-pinned, process-local and documented', async () => {
  const source = await readFile(helper, 'utf8');
  const docs = await readFile(new URL('../../docs/DEPLOYMENT_CI.md', import.meta.url), 'utf8');
  assert.match(source, /PSScriptRoot/);
  assert.match(source, /\.nvmrc/);
  assert.match(source, /LASTEXITCODE/);
  assert.match(source, /taskReportedNode -cne/);
  assert.match(source, /InvocationName -ne '\.'/);
  assert.doesNotMatch(source, /Set-ExecutionPolicy|SetEnvironmentVariable|Invoke-WebRequest|DownloadFile/);
  assert.match(docs, /\. \.\\scripts\\use-node24\.ps1/);
  assert.match(docs, /SHASUMS256\.txt/);
});

test('Windows activation works outside the project and repeated sourcing preserves PATH once', { skip: !windows }, async () => {
  const value = await fixture();
  try {
    const output = powershell(`
      $before = $env:Path;
      . ${quote(value.script)};
      $first = $env:Path;
      . ${quote(value.script)};
      if ($env:Path -cne $first) { throw 'Repeated activation changed PATH' };
      if ($env:Path -cne (${quote(value.binaryDirectory)} + ';' + $before)) { throw 'Existing PATH was not preserved' };
      if ((node --version) -cne ${quote(`v${pinned}`)}) { throw 'Wrong active Node' };
      if ((Get-Command npm.cmd).Source -cne ${quote(join(value.binaryDirectory, 'npm.cmd'))}) { throw 'Wrong npm command selected' };
      'PASS';
    `);
    assert.match(output, /PASS/);
  } finally { await value.cleanup(); }
});

test('Windows activation rejects missing, mismatched and malformed runtimes without changing PATH', { skip: !windows }, async () => {
  for (const options of [{ runtime: false }, { version: '24.0.0' }, { version: '20.17.0', runtime: false }]) {
    const value = await fixture(options);
    try {
      powershell(`
        $before = $env:Path; $failed = $false;
        try { . ${quote(value.script)} } catch { $failed = $true };
        if (!$failed) { throw 'Invalid runtime was accepted' };
        if ($env:Path -cne $before) { throw 'Failed activation changed PATH' };
      `);
    } finally { await value.cleanup(); }
  }
});

test('Windows activation rejects non-dot-sourcing and rolls back a node alias override', { skip: !windows }, async () => {
  const value = await fixture();
  try {
    powershell(`
      $before = $env:Path; $failed = $false;
      try { & ${quote(value.script)} } catch { $failed = $true };
      if (!$failed -or $env:Path -cne $before) { throw 'Non-dot-source invocation was accepted' };
      Set-Alias node Get-Date;
      $failed = $false;
      try { . ${quote(value.script)} } catch { $failed = $true };
      if (!$failed -or $env:Path -cne $before) { throw 'Command override did not restore PATH' };
    `);
  } finally { await value.cleanup(); }
});
