// Shared fail-closed classifier for 03D3B relational harness cases. No I/O.
export const OWNER_CONSTRAINT_BY_CASE = Object.freeze({
  '03D2A-SB-PLAN-CREATE-CROSS-BATCH-A':'educativo_ia_planeaciones_batch_owner_fkey',
  '03D2A-SB-PLAN-CREATE-CROSS-BATCH-B':'educativo_ia_planeaciones_batch_owner_fkey',
  '03D2A-SB-PLAN-EDIT-CROSS-BATCH-A':'educativo_ia_planeaciones_batch_owner_fkey',
  '03D2B-SB-ANEXO-CREATE-REL-CROSS-A':'educativo_ia_anexos_planeacion_owner_fkey',
  '03D2B-SB-ANEXO-CREATE-BATCH-CROSS-A':'educativo_ia_anexos_batch_owner_fkey',
  '03D2B-SB-ANEXO-EDIT-REL-CROSS-A':'educativo_ia_anexos_planeacion_owner_fkey',
  '03D2B-SB-ANEXO-EDIT-BATCH-CROSS-A':'educativo_ia_anexos_batch_owner_fkey',
  '03D2B-SB-LISTA-CREATE-REL-CROSS-A':'educativo_ia_listas_planeacion_owner_fkey',
  '03D2B-SB-LISTA-CREATE-BATCH-CROSS-A':'educativo_ia_listas_batch_owner_fkey',
  '03D2B-SB-LISTA-EDIT-REL-CROSS-A':'educativo_ia_listas_planeacion_owner_fkey',
  '03D2B-SB-LISTA-EDIT-BATCH-CROSS-A':'educativo_ia_listas_batch_owner_fkey',
  '03D2B-SB-EXAMEN-CREATE-REL-CROSS-A':'educativo_ia_examenes_unidad_owner_fkey',
  '03D2B-SB-EXAMEN-CREATE-BATCH-CROSS-A':'educativo_ia_examenes_batch_owner_fkey',
  '03D2B-SB-EXAMEN-EDIT-REL-CROSS-A':'educativo_ia_examenes_unidad_owner_fkey',
  '03D2B-SB-EXAMEN-EDIT-BATCH-CROSS-A':'educativo_ia_examenes_batch_owner_fkey',
  '03D2C-SB-ITEM-CREATE-JOB-CROSS-A':'educativo_ia_examen_items_job_owner_fkey',
  '03D2C-SB-ITEM-EDIT-JOB-CROSS-A':'educativo_ia_examen_items_job_owner_fkey',
  '03D2C-SB-EXAM-CREATE-JOB-CROSS-A':'educativo_ia_examenes_generation_job_owner_fkey',
  '03D2C-SB-EXAM-EDIT-JOB-CROSS-A':'educativo_ia_examenes_generation_job_owner_fkey'
});
export const OWNER_CONSTRAINTS=Object.freeze([...new Set(Object.values(OWNER_CONSTRAINT_BY_CASE))]);
const MESSAGE=/^insert or update on table "[a-z_][a-z0-9_]*" violates foreign key constraint "([a-z_][a-z0-9_]*)"$/;

export function extractOwnerConstraint(error){
  if(!error||typeof error!=='object'||Array.isArray(error))return null;
  const candidates=[];
  if(typeof error.constraint==='string'&&OWNER_CONSTRAINTS.includes(error.constraint))candidates.push(error.constraint);
  if(typeof error.message==='string'){
    const match=error.message.match(MESSAGE);
    if(match&&OWNER_CONSTRAINTS.includes(match[1]))candidates.push(match[1]);
  }
  return candidates.length===1?candidates[0]:null;
}

export function classifyOwnerConstraintRejection({caseId,response,snapshotClean}){
  const code=typeof response?.data?.code==='string'?response.data.code:null;
  const expected=OWNER_CONSTRAINT_BY_CASE[caseId];
  if(code==='42501')return {result:snapshotClean?'PASS':'INCONCLUSIVE',reason:'rls',dbCode:code};
  if(code!=='23503')return {result:'INCONCLUSIVE',reason:code==='23505'?'unique':code==='23514'?'check':'foreign_key',...(code?{dbCode:code}:{})};
  const constraint=extractOwnerConstraint(response.data);
  if(!expected||constraint!==expected||!snapshotClean)return {result:'INCONCLUSIVE',reason:'foreign_key',dbCode:code};
  return {result:'PASS',reason:'owner_constraint',dbCode:code,constraint};
}
