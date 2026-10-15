import { readFile, appendFile } from 'node:fs/promises';

const result = JSON.parse(await readFile(process.argv[2], 'utf8'));
const deployment = result.deployment ?? result;
if (!deployment.url) throw new Error('Vercel returned no deployment URL');
const values = [...new Set([deployment.url, deployment.productionUrl].filter(Boolean))];
const urls = values.map(value => {
  const url = new URL(value.startsWith('https://') ? value : `https://${value}`);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app') || url.username || url.password) {
    throw new Error('Unexpected Vercel deployment URL');
  }
  return url.href;
});
const [deploymentUrl] = urls;
const productionUrl = deployment.productionUrl ? urls.at(-1) : deploymentUrl;
const isProduction = process.env.DEPLOY_TARGET === 'production';
const label = isProduction ? 'Production' : 'Preview';
const primaryUrl = isProduction ? productionUrl : deploymentUrl;
const summary = [
  `\n## ${label}の公開URL`,
  '',
  `### [${label}を開く](${primaryUrl})`,
  '',
  '| 確認先 | リンク |',
  '| --- | --- |',
  ...(isProduction && deployment.productionUrl ? [`| 本番URL | [アプリを開く](${productionUrl}) |`] : []),
  `| 今回のデプロイ | [この実行で公開したアプリを開く](${deploymentUrl}) |`,
  '',
  ...(!isProduction ? ['ブランチ固定URLは、下の「ブランチ別Preview」から開けます。', ''] : []),
].join('\n');
for (const url of urls) console.log(`Deployment ready: ${url}`);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `deployment_url=${deploymentUrl}\n`);
}
