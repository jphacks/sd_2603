import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkRuntime(nodeVersion = process.versions.node) {
  const pinned = readFileSync(new URL('../../.nvmrc', import.meta.url), 'utf8').trim();
  const alternative = readFileSync(new URL('../../.node-version', import.meta.url), 'utf8').trim();
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  if (!/^24\.\d+\.\d+$/.test(pinned) || alternative !== pinned || pkg.engines?.node !== '24.x' || !/^\^24(?:\.|$)/.test(pkg.devDependencies?.['@types/node'] ?? '')) {
    throw new Error('Node.js runtime declarations must agree on major version 24 (.nvmrc, .node-version, engines.node and @types/node).');
  }
  if (Number(nodeVersion.split('.')[0]) !== 24) {
    throw new Error(`Node.js 24.x is required (currently ${nodeVersion}). Select the version in .nvmrc before running npm commands.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkRuntime();
}
