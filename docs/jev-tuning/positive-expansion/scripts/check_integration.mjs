// Read and run only the integration branch's pure offline schema/provenance functions.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const integration=process.argv[2];
if(!integration)throw new Error('Usage: node check_integration.mjs /path/to/integration-checkout');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const core=resolve(integration,'evals/tuning/core.mjs'), data=resolve(integration,'evals/tuning/data.mjs');
const {validateCases}=await import(pathToFileURL(core));
const {assertProvenance}=await import(pathToFileURL(data));
const cases=['validation','test'].flatMap(s=>JSON.parse(readFileSync(resolve(root,`data/primary-positive-${s}.json`),'utf8')));
validateCases(cases);
let provenance='accepted', detail=null;
try{assertProvenance(cases);}catch(error){
 if(!error.message.startsWith('Synthetic case outside train:'))throw error;
 provenance='requires_explicit_synthetic_holdout_support';detail=error.message;
}
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const result={n:cases.length,generalSemanticSchemaPassed:true,provenanceCompatibility:provenance,detail,modelCalls:0,coreSha256:hash(core),provenanceValidatorSha256:hash(data)};
writeFileSync(resolve(root,'integration-schema-check.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
