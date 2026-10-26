// Pure classifier for the explicit pre/post 03D3C2-B0-current harness mode.
export const B0_CURRENT_MODES = Object.freeze(['pre_b0', 'post_b0_current']);

const entries = [
  ['03D2A-SB-BATCH-ANON','planeacion_batches','SELECT'],['03D2A-SB-BATCH-ANON-B','planeacion_batches','SELECT'],
  ['03D2A-SB-BATCH-CREATE-ANON','planeacion_batches','INSERT'],['03D2A-SB-BATCH-EDIT-ANON','planeacion_batches','UPDATE'],
  ['03D2A-SB-BATCH-DELETE-ANON','planeacion_batches','DELETE'],['03D2A-SB-PLAN-ANON','planeaciones','SELECT'],
  ['03D2A-SB-PLAN-ANON-B','planeaciones','SELECT'],['03D2A-SB-PLAN-CREATE-ANON','planeaciones','INSERT'],
  ['03D2A-SB-PLAN-EDIT-ANON','planeaciones','UPDATE'],['03D2A-SB-PLAN-DELETE-ANON','planeaciones','DELETE'],
  ...['ANEXO:anexos','LISTA:listas_cotejo','EXAMEN:examenes'].flatMap(pair => {
    const [code,table]=pair.split(':');
    return [['READ-ANON','SELECT'],['CREATE-ANON','INSERT'],['EDIT-ANON','UPDATE'],['DELETE-ANON','DELETE']]
      .map(([suffix,operation])=>[`03D2B-SB-${code}-${suffix}`,table,operation]);
  }),
  ...['EJOB:examen_generation_jobs','ITEM:examen_generation_items'].flatMap(pair => {
    const [code,table]=pair.split(':');
    return [[`03D2C-SB-${code}-READ-ANON`,table,'SELECT'],[`03D2C-SB-${code}-DELETE-ANON`,table,'DELETE']];
  }),
];

export const B0_ANON_CASES = Object.freeze(Object.fromEntries(entries.map(([caseId,table,operation])=>
  [caseId,Object.freeze({actor:'anon',table,operation})])));

export function normalizeB0CurrentMode(value) {
  const mode=value===undefined||value===''?'pre_b0':value;
  if(!B0_CURRENT_MODES.includes(mode)) throw new Error('invalid_b0_current_mode');
  return mode;
}

export function classifyPostB0AnonRejection({mode,caseId,actor,table,operation,response,snapshotClean,uncertainPending}) {
  if(normalizeB0CurrentMode(mode)!=='post_b0_current') return Object.freeze({result:'legacy'});
  const expected=B0_ANON_CASES[caseId];
  const dbCode=typeof response?.data?.code==='string'?response.data.code:undefined;
  if(!expected||actor!=='anon'||expected.actor!==actor||expected.table!==table||expected.operation!==operation)
    return Object.freeze({result:'INCONCLUSIVE',reason:'b0_case_mismatch',...(dbCode?{dbCode}:{})});
  if(response?.ok||dbCode!=='42501'||snapshotClean!==true||uncertainPending!==false)
    return Object.freeze({result:'INCONCLUSIVE',reason:'b0_rejection_unverified',...(dbCode?{dbCode}:{})});
  return Object.freeze({result:'PASS',reason:'b0_grant_revoked',dbCode:'42501'});
}
