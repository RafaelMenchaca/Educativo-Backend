// Educativo IA 03D2B recovery. Importing this module performs no I/O.
import { validateBibliotecaConfig } from './biblioteca-harness.js';

export const RECOVERY_TEST_URL = 'https://gwdtlbisykzzplgzczzq.supabase.co';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BIGINT = /^[1-9][0-9]{0,14}$/;
const TABLES = ['planeacion_batches','planeaciones','anexos','listas_cotejo','examenes'];
const MARKER_FIELD = {planeacion_batches:'titulo',planeaciones:'tema',anexos:'titulo',listas_cotejo:'titulo',examenes:'titulo'};
const SELECT = {
  planeacion_batches:'id,user_id,titulo,plantel_id,grado_id,materia_id,unidad_id',
  planeaciones:'id,user_id,tema,batch_id,tema_id',
  anexos:'id,user_id,titulo,planeacion_id,batch_id,tema_id,unidad_id',
  listas_cotejo:'id,user_id,titulo,planeacion_id,batch_id,tema_id,unidad_id',
  examenes:'id,user_id,titulo,unidad_id,batch_id,generation_job_id,plantel_id,grado_id,materia_id'
};
const SUFFIXES = Object.freeze({
  planeacion_batches:new Set(['precondition']),
  planeaciones:new Set(['precondition','target-anexo-insert','target-anexo-update','target-lista-insert','target-lista-update','target-anexo-batch-insert','target-anexo-batch-update','target-anexo-delete','target-lista-batch-insert','target-lista-batch-update','target-lista-delete']),
  anexos:new Set(['base','adversarial','delete','batch-update']),
  listas_cotejo:new Set(['base','adversarial','delete','batch-update']),
  examenes:new Set(['base','adversarial','delete'])
});
const MAX_ROWS = {planeacion_batches:2,planeaciones:12,anexos:8,listas_cotejo:8,examenes:8};
const SAFE_REASONS = new Set(['http','identity_mismatch','anonymous_identity','invalid_json','redirect','timeout','network','unexpected_response','invalid_state','unexpected_marker','too_many_rows','owner_mismatch','external_dependent','ambiguous_fixture']);

class RecoveryError extends Error { constructor(diagnostic){super('03D2B recovery: estado inseguro');this.diagnostic=diagnostic;} }
const fail=d=>{throw new RecoveryError(d);};
const enc=value=>encodeURIComponent(String(value));
const stable=value=>JSON.stringify(value,Object.keys(value||{}).sort());
function timeoutFactory(ms){const c=new AbortController();let hit=false;const t=setTimeout(()=>{hit=true;c.abort();},ms);return {signal:c.signal,didTimeout:()=>hit,clear:()=>clearTimeout(t)};}

export function validateRecoveryConfig(env,now=Date.now()) {
  if(!UUID.test(env.EDUCATIVO_RECOVERY_RUN_ID||''))fail({phase:'config',reason:'invalid_state'});
  for(const name of Object.keys(env))if(/^EDUCATIVO_(?:FIXTURE|ROW|BATCH|PLANEACION|ANEXO|LISTA|EXAMEN|UNIDAD)_ID$/.test(name)&&env[name])fail({phase:'config',reason:'invalid_state'});
  const base=validateBibliotecaConfig({...env,EDUCATIVO_API_URL:'http://127.0.0.1:3000',EDUCATIVO_LOCAL_API_VERIFIED:'confirmed'},now);
  return Object.freeze({...base,runId:env.EDUCATIVO_RECOVERY_RUN_ID.toLowerCase()});
}

export function safeRecoveryEvent(event={}) {
  const out={};
  if(['RUN','DIAGNOSTIC','DISCOVERY','REMOVED','ABSENT_CONFIRMED','DELETE_UNVERIFIED','SUMMARY'].includes(event.caseId))out.caseId=event.caseId;
  if(['config','auth','discover','recover'].includes(event.phase))out.phase=event.phase;
  if(['A','B'].includes(event.actor))out.actor=event.actor;
  if(TABLES.includes(event.table))out.table=event.table;
  if(SAFE_REASONS.has(event.reason))out.reason=event.reason;
  if(Number.isInteger(event.status)&&event.status>=100&&event.status<=599)out.status=event.status;
  if(UUID.test(event.runId||''))out.runId=event.runId.toLowerCase();
  for(const key of ['discovered','removed','absentConfirmed','deleteUnverified','inconclusive','commandErrors','fixturesPending'])if(Number.isSafeInteger(event[key])&&event[key]>=0)out[key]=event[key];
  if(typeof event.successful==='boolean')out.successful=event.successful;
  return out;
}

function parseMarker(runId,table,value) {
  if(typeof value!=='string')return null;
  const match=value.match(new RegExp(`^Educativo IA 03D2B ${runId} (A|B) ${table} ([a-z-]+)$`));
  if(!match||!SUFFIXES[table].has(match[2]))return null;
  return {markerActor:match[1],suffix:match[2]};
}

export function createDerivedRecovery(env,{fetchImpl=globalThis.fetch,emit=()=>{},now=Date.now,timeoutControlFactory=timeoutFactory}={}) {
  const config=validateRecoveryConfig(env,now()), ledger=new Map();
  let discovered=false,removed=0,absentConfirmed=0,deleteUnverified=0,inconclusive=0,commandErrors=0;
  const report=e=>emit(safeRecoveryEvent(e)); report({caseId:'RUN',runId:config.runId});
  const diagnose=d=>{inconclusive++;report({caseId:'DIAGNOSTIC',...d});fail(d);};
  async function request(path,actor,method='GET') {
    validateRecoveryConfig(env,now());
    if(!path.startsWith('/')||path.startsWith('//'))diagnose({phase:'recover',actor,reason:'invalid_state'});
    const url=new URL(path,RECOVERY_TEST_URL);if(url.origin!==RECOVERY_TEST_URL||url.username||url.password)diagnose({phase:'recover',actor,reason:'invalid_state'});
    const tc=timeoutControlFactory(15000),headers={apikey:config.key,Authorization:`Bearer ${config.actors[actor].token}`,'Content-Type':'application/json'};
    if(method==='DELETE')headers.Prefer='return=minimal';
    try{const response=await fetchImpl(url.href,{method,headers,redirect:'error',signal:tc.signal});if(response.redirected||(response.url&&new URL(response.url).origin!==RECOVERY_TEST_URL)||(response.status>=300&&response.status<400))diagnose({phase:'recover',actor,reason:'redirect',status:response.status});let data=null;if(response.status!==204){try{data=await response.json();}catch{diagnose({phase:'recover',actor,reason:'invalid_json',status:response.status});}}return {ok:response.ok,status:response.status,data};}catch(error){if(error instanceof RecoveryError)throw error;diagnose({phase:'recover',actor,reason:tc.didTimeout()?'timeout':'network'});}finally{tc.clear();}
  }
  async function auth(){for(const actor of ['A','B']){const r=await request('/auth/v1/user',actor);if(!r.ok)diagnose({phase:'auth',actor,reason:'http',status:r.status});if(!r.data||r.data.id?.toLowerCase()!==config.actors[actor].id||r.data.is_anonymous!==false)diagnose({phase:'auth',actor,reason:'identity_mismatch'});}}
  const idValid=(table,id)=>table==='planeaciones'?BIGINT.test(String(id)):UUID.test(String(id));
  function addRow(table,row,viewer){
    const parsed=parseMarker(config.runId,table,row?.[MARKER_FIELD[table]]);if(!parsed)diagnose({phase:'discover',actor:viewer,table,reason:'unexpected_marker'});
    if(!idValid(table,row.id)||!UUID.test(row.user_id||''))diagnose({phase:'discover',actor:viewer,table,reason:'unexpected_response'});
    const owner=['A','B'].find(a=>config.actors[a].id===row.user_id.toLowerCase());if(!owner||owner!==viewer)diagnose({phase:'discover',actor:viewer,table,reason:'owner_mismatch'});
    const key=`${table}:${row.id}`;const existing=ledger.get(key);if(existing&&stable(existing.row)!==stable(row))diagnose({phase:'discover',actor:viewer,table,reason:'ambiguous_fixture'});
    ledger.set(key,{table,id:String(row.id),owner,markerActor:parsed.markerActor,suffix:parsed.suffix,row,state:'pending_delete'});
  }
  async function discover(){if(discovered)diagnose({phase:'discover',reason:'invalid_state'});await auth();for(const table of TABLES){const field=MARKER_FIELD[table],prefix=`Educativo IA 03D2B ${config.runId}*`;let count=0;for(const actor of ['A','B']){const path=`/rest/v1/${table}?${field}=like.${enc(prefix)}&select=${enc(SELECT[table])}`;const r=await request(path,actor);if(!r.ok||!Array.isArray(r.data))diagnose({phase:'discover',actor,table,reason:'unexpected_response',status:r.status});count+=r.data.length;for(const row of r.data)addRow(table,row,actor);}if(count>MAX_ROWS[table])diagnose({phase:'discover',table,reason:'too_many_rows'});}const logical=new Map();for(const e of ledger.values()){const k=`${e.table}:${e.markerActor}:${e.suffix}`,n=(logical.get(k)||0)+1;logical.set(k,n);if(n>(e.suffix==='adversarial'?4:1))diagnose({phase:'discover',actor:e.owner,table:e.table,reason:'ambiguous_fixture'});}validateGraph();const uncertain=[...ledger.values()].filter(e=>e.table==='anexos'&&e.markerActor==='A'&&e.suffix==='delete');if(uncertain.length===0){absentConfirmed++;report({caseId:'ABSENT_CONFIRMED',runId:config.runId,table:'anexos'});}if(uncertain.length>1)diagnose({phase:'discover',table:'anexos',reason:'ambiguous_fixture'});discovered=true;report({caseId:'DISCOVERY',runId:config.runId,discovered:ledger.size,absentConfirmed});return state();}
  function validateGraph(){const batches=new Map([...ledger.values()].filter(e=>e.table==='planeacion_batches').map(e=>[e.id,e]));const plans=new Map([...ledger.values()].filter(e=>e.table==='planeaciones').map(e=>[e.id,e]));for(const e of ledger.values()){if(e.table==='planeacion_batches'){if(e.markerActor!==e.owner||[e.row.plantel_id,e.row.grado_id,e.row.materia_id,e.row.unidad_id].some(v=>v!=null))diagnose({phase:'discover',actor:e.owner,table:e.table,reason:'unexpected_response'});continue;}if(e.table==='planeaciones'){const parent=batches.get(String(e.row.batch_id));if(e.markerActor!==e.owner||!parent||parent.owner!==e.owner||e.row.tema_id!=null)diagnose({phase:'discover',actor:e.owner,table:e.table,reason:'external_dependent'});continue;}const ownRelation=e.suffix!=='adversarial';if(e.table==='anexos'||e.table==='listas_cotejo'){const plan=plans.get(String(e.row.planeacion_id)),batch=batches.get(String(e.row.batch_id));if(!plan||!batch||(ownRelation&&(e.markerActor!==e.owner||plan.owner!==e.owner||batch.owner!==e.owner)))diagnose({phase:'discover',actor:e.owner,table:e.table,reason:'external_dependent'});}else if(e.table==='examenes'){const batch=batches.get(String(e.row.batch_id));if(!UUID.test(e.row.unidad_id||'')||!batch||e.row.generation_job_id!=null||(ownRelation&&(e.markerActor!==e.owner||batch.owner!==e.owner)))diagnose({phase:'discover',actor:e.owner,table:e.table,reason:'external_dependent'});}}}
  async function visible(table,id,actor){const r=await request(`/rest/v1/${table}?id=eq.${enc(id)}&select=${enc(SELECT[table])}`,actor);if(!r.ok||!Array.isArray(r.data))diagnose({phase:'recover',actor,table,reason:'unexpected_response',status:r.status});return r.data;}
  async function checkDependents(entry){const relations=entry.table==='planeaciones'?[['anexos','planeacion_id'],['listas_cotejo','planeacion_id']]:entry.table==='planeacion_batches'?[['planeaciones','batch_id'],['anexos','batch_id'],['listas_cotejo','batch_id'],['examenes','batch_id']]:[];for(const [table,field] of relations)for(const actor of ['A','B']){const r=await request(`/rest/v1/${table}?${field}=eq.${enc(entry.id)}&select=id`,actor);if(!r.ok||!Array.isArray(r.data))diagnose({phase:'recover',actor,table,reason:'unexpected_response'});for(const row of r.data)if(!ledger.has(`${table}:${row.id}`))diagnose({phase:'recover',actor,table,reason:'external_dependent'});}}
  async function recover(){if(!discovered)diagnose({phase:'recover',reason:'invalid_state'});await auth();const rank=e=>['anexos','listas_cotejo','examenes'].includes(e.table)?0:e.table==='planeaciones'?1:2;for(const entry of [...ledger.values()].sort((a,b)=>rank(a)-rank(b))){if(!ledger.has(`${entry.table}:${entry.id}`))continue;if(entry.state==='delete_unverified'){const a=await visible(entry.table,entry.id,'A'),b=await visible(entry.table,entry.id,'B');if(a.length===0&&b.length===0){ledger.delete(`${entry.table}:${entry.id}`);removed++;deleteUnverified--;report({caseId:'REMOVED',runId:config.runId,table:entry.table,actor:entry.owner});continue;}if(a.length>1||b.length>1)diagnose({phase:'recover',table:entry.table,reason:'ambiguous_fixture'});}const own=await visible(entry.table,entry.id,entry.owner);if(own.length!==1||stable(own[0])!==stable(entry.row))diagnose({phase:'recover',actor:entry.owner,table:entry.table,reason:'unexpected_response'});await checkDependents(entry);entry.state='delete_unverified';deleteUnverified++;let response;try{response=await request(`/rest/v1/${entry.table}?id=eq.${enc(entry.id)}&user_id=eq.${enc(config.actors[entry.owner].id)}`,entry.owner,'DELETE');}catch(error){report({caseId:'DELETE_UNVERIFIED',runId:config.runId,actor:entry.owner,table:entry.table,deleteUnverified});throw error;}if(!response.ok)diagnose({phase:'recover',actor:entry.owner,table:entry.table,reason:'http',status:response.status});const a=await visible(entry.table,entry.id,'A'),b=await visible(entry.table,entry.id,'B');if(a.length||b.length){report({caseId:'DELETE_UNVERIFIED',runId:config.runId,actor:entry.owner,table:entry.table,deleteUnverified});diagnose({phase:'recover',actor:entry.owner,table:entry.table,reason:'unexpected_response'});}ledger.delete(`${entry.table}:${entry.id}`);deleteUnverified--;removed++;report({caseId:'REMOVED',runId:config.runId,actor:entry.owner,table:entry.table});}return state();}
  function state(){return {runId:config.runId,discovered:discovered?removed+ledger.size:0,removed,absentConfirmed,deleteUnverified,inconclusive,commandErrors,fixturesPending:ledger.size,successful:discovered&&ledger.size===0&&deleteUnverified===0&&inconclusive===0&&commandErrors===0};}
  return Object.freeze({discover,recover,state});
}

export function recoveryExitCode(state){return state.successful?0:1;}
