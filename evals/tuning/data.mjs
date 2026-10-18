import { createHash } from 'node:crypto';
export function adaptCases(raw) {
  const input=Array.isArray(raw)?raw:raw.cases;
  if(!Array.isArray(input))throw new Error('Expected a case array or {cases:[]}');
  return input.map(c=>{
    const action=c.gold?.action??c.expectedAction??c.gold_action;
    let status=c.gold?.status??c.gold_status??c.expectedStatus;
    const reason=c.expectedReasonCode??c.gold?.reasonCode??c.reasonCode;
    const statuses={DRIFT:'INTERVENE_DRIFT',DRIFTED_IRRELEVANT:'INTERVENE_DRIFT',STALLED:'INTERVENE_STALLED',INTERVENE_STALL:'INTERVENE_STALLED',ON_TOPIC:'OK',OBSERVE:'OK',SILENCE:'OK',WAIT:'OK'};
    status=statuses[status]??status;
    if(!status && action && action!=='INTERVENE')status='OK';
    if(!status && reason)status=statuses[reason];
    // Existing 20-case regression data only: semantic intervention subtype is in group.
    if(!status && action==='INTERVENE' && ['stall','stalled','drift'].includes(c.group))status=c.group==='drift'?'INTERVENE_DRIFT':'INTERVENE_STALLED';
    const transcript=c.transcript??c.conversation;
    const agenda=c.agenda??c.topic;
    const group=c.sourceGroup??c.groupId??c.source?.seriesId??c.provenance?.seriesId;
    const seconds=c.secondsSinceLastIntervention??120;
    if(!Number.isFinite(seconds)||seconds<0)throw new Error(`Invalid cooldown: ${c.id}`);
    return {...c,agenda,transcript,sourceGroup:group??('legacy-'+createHash('sha256').update(agenda??'').digest('hex').slice(0,12)),
      split:c.split==='valid'?'validation':c.split??'train',
      secondsSinceLastIntervention:seconds,
      gold:{...c.gold,status,...(action?{action}:{}),reason:c.gold?.reason??c.gold_reason??c.rationale}};
  });
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const nonempty = s => typeof s === 'string' && s.trim().length > 0;

// Freeze these independently: editing labels must not look like editing inputs.
export function authoredCaseHashes(c) {
  return { inputHash: digest({ id:c.id, agenda:c.agenda, phase:c.phase ?? null, transcript:c.transcript, sourceGroup:c.sourceGroup, split:c.split, generation:c.generation }),
    labelHash: digest({ gold:c.gold, annotation:c.annotation }) };
}

export function validateSplitManifest(manifest) {
  if (!nonempty(manifest?.version) || !Array.isArray(manifest.groups) || !manifest.groups.length || !Array.isArray(manifest.caseAssignments) || !manifest.caseAssignments.length)
    throw new Error('Authored evaluation requires a predeclared split manifest');
  const groups = new Map(), assignments = new Map();
  for (const group of manifest.groups) {
    const id = group.familyId ?? group.sourceGroup;
    if (!nonempty(id) || groups.has(id) || !['train','validation','test'].includes(group.split) || !nonempty(group.author)) throw new Error('Invalid/duplicate manifest group');
    groups.set(id, group);
  }
  for (const row of manifest.caseAssignments) {
    const group = groups.get(row.sourceGroup ?? row.familyId);
    if (!nonempty(row.id) || assignments.has(row.id) || !group || row.split !== group.split || (row.fold !== undefined && row.fold !== group.fold)) throw new Error('Invalid/duplicate manifest assignment');
    for (const key of ['inputHash','labelHash']) if (row[key] !== undefined && !/^[a-f0-9]{64}$/.test(row[key])) throw new Error(`Invalid manifest ${key}`);
    assignments.set(row.id, row);
  }
  return { groups, assignments };
}

export function assertProvenance(cases, options = {}) {
  const manifest = options.allowAuthoredEvaluation ? validateSplitManifest(options.splitManifest) : null;
  for(const c of cases){
    if (options.allowAuthoredEvaluation && c.generation) {
      const g=c.generation, group=manifest.groups.get(c.sourceGroup), assignment=manifest.assignments.get(c.id);
      if(c.dataKind!=='synthetic'||(c.source?.kind && c.source.kind!=='synthetic'))throw new Error(`Authored case must explicitly be synthetic: ${c.id}`);
      if(!nonempty(g.version)||g.version!==options.splitManifest.version||g.familyId!==c.sourceGroup||!nonempty(g.author)||!Array.isArray(g.researchReferences)||!g.researchReferences.length||!g.researchReferences.every(nonempty))throw new Error(`Invalid authored generation: ${c.id}`);
      if(!group||!assignment||group.author!==g.author||group.split!==c.split||(assignment.sourceGroup??assignment.familyId)!==c.sourceGroup||assignment.split!==c.split)throw new Error(`Authored split/author mismatch: ${c.id}`);
      const a=c.annotation;
      if(!['INTERVENE_DRIFT','INTERVENE_STALLED','OK'].includes(c.gold?.status)||!nonempty(c.gold?.reason)||!a||typeof a!=='object'||Array.isArray(a)||
        a.labelSource!=='independent_gpt_silver'||a.humanReviewed!==false||!nonempty(a.annotator)||a.annotator===g.author||
        !['high','medium','low'].includes(a.confidence)||typeof a.uncertain!=='boolean'||
        !Array.isArray(a.evidenceTurns)||!a.evidenceTurns.length||!Array.isArray(c.transcript)||
        !a.evidenceTurns.every(i=>Number.isInteger(i)&&i>=0&&i<c.transcript.length))throw new Error(`Missing independent annotation/gold: ${c.id}`);
      if(c.cvFold!==undefined&&c.cvFold!==group.fold)throw new Error(`Authored cvFold mismatch: ${c.id}`);
      if(c.parentId||c.source?.parentId)throw new Error(`Authored evaluation cannot have conversation parents: ${c.id}`);
      const hashes=authoredCaseHashes(c);
      for(const key of ['inputHash','labelHash'])if(assignment[key]!==undefined&&assignment[key]!==hashes[key])throw new Error(`Frozen ${key} changed: ${c.id}`);
      continue;
    }
    if(c.dataKind==='synthetic'||c.source?.kind==='synthetic'){
      if(c.split!=='train')throw new Error(`Synthetic case outside train: ${c.id}`);
      const parent=cases.find(p=>p.id===(c.parentId??c.source?.parentId));
      if(!parent||parent.split!=='train'||parent.sourceGroup!==c.sourceGroup)throw new Error(`Synthetic parent must be same training group: ${c.id}`);
      continue;
    }
    const p=c.provenance??c.source;
    if(!(p?.seriesId??c.sourceGroup)||c.sourceGroup.startsWith('legacy-'))throw new Error(`Explicit source series required: ${c.id}`);
    if(!p?.license||!(p.source??p.url)||!(p.meeting??p.meetingId))throw new Error(`Missing source/license/meeting: ${c.id}`);
  }
}
