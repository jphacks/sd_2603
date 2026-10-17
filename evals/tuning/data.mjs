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
export function assertProvenance(cases) {
  for(const c of cases){
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
