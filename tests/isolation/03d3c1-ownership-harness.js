// 03D3C1 ownership runtime harness. Importing performs no I/O.
import { randomUUID } from 'node:crypto';
import { validateBibliotecaConfig, planeacionIdFromUuid } from './biblioteca-harness.js';
import { OWNERSHIP_CASE_MANIFEST, OWNERSHIP_FUNCTIONS, CLEANUP_ORDER, markerFor } from './03d3c1-runtime-validation-plan.js';

export const OWNERSHIP_TEST_URL='https://gwdtlbisykzzplgzczzq.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABLES=['planteles','grados','materias','unidades','temas','planeaciones'];
const SPEC=Object.freeze({
 planteles:{marker:'nombre',parent:null,role:'plantel-base',select:'id,user_id,nombre,created_at,updated_at'},
 grados:{marker:'nombre',parent:'planteles',relation:'plantel_id',role:'grado-base',select:'id,user_id,plantel_id,nombre,nivel_base,created_at,updated_at'},
 materias:{marker:'nombre',parent:'grados',relation:'grado_id',role:'materia-base',select:'id,user_id,grado_id,nombre,created_at,updated_at'},
 unidades:{marker:'nombre',parent:'materias',relation:'materia_id',role:'unidad-base',select:'id,user_id,materia_id,nombre,orden,created_at,updated_at'},
 temas:{marker:'titulo',parent:'unidades',relation:'unidad_id',role:'tema-base',select:'id,user_id,unidad_id,titulo,duracion,orden,created_at,updated_at'},
 planeaciones:{marker:'custom_title',parent:'temas',relation:'tema_id',role:'planeacion-base',select:'id,user_id,tema_id,custom_title,status,actividades_momentos,fecha_creacion,updated_at'}
});
const TRIGGERS=Object.freeze({
 grados:{logical:'enforce_grado_ownership',message:'plantel_id no pertenece a este usuario'},
 materias:{logical:'enforce_materia_ownership',message:'grado_id no pertenece a este usuario'},
 temas:{logical:'enforce_tema_ownership',message:'unidad_id no pertenece a este usuario'},
 planeaciones:{logical:'enforce_planeacion_tema_ownership',message:'tema_id no pertenece a este usuario'}
});
const ALLOWED_MESSAGES=new Set(Object.values(TRIGGERS).map(x=>x.message));
const enc=x=>encodeURIComponent(String(x));
const stable=x=>JSON.stringify(x,Object.keys(x||{}).sort());
const validTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
class OwnershipError extends Error{constructor(d){super('03D3C1 ownership: estado inseguro');this.diagnostic=d;}}
const stop=d=>{throw new OwnershipError(d)};

export function classifyOwnershipP0001(error,table){
 const expected=TRIGGERS[table]; if(!expected||error?.code!=='P0001')return {kind:'inconclusive',dbCode:typeof error?.code==='string'?error.code:undefined};
 const fields=['message','details','hint'].filter(k=>typeof error?.[k]==='string'&&error[k].length).map(k=>error[k]);
 const hits=fields.filter(v=>ALLOWED_MESSAGES.has(v));
 if(fields.length!==1||hits.length!==1||hits[0]!==expected.message)return {kind:'inconclusive',dbCode:'P0001'};
 return {kind:'expected',dbCode:'P0001',trigger:expected.logical};
}
export function safeOwnershipEvent(e={}){const o={};
 if(/^(03D3C1-(OWN|UPDATED)-[A-Z0-9-]+|RUN|UNCERTAIN|CREATED|REMOVED|DIAGNOSTIC|SUMMARY)$/.test(e.caseId||''))o.caseId=e.caseId;
 if(['config','auth','prepare','execute','cleanup'].includes(e.phase))o.phase=e.phase;
 if(['A','B'].includes(e.actor))o.actor=e.actor;if(TABLES.includes(e.table))o.table=e.table;
 if(['PASS','FAIL','INCONCLUSIVE','CREATED','REMOVED','PENDING'].includes(e.result))o.result=e.result;
 if(['expected_trigger','wrong_rejection','relation_persisted','snapshot_changed','timeout','network','http','invalid_json','invalid_state','delete_unverified','unexpected_response'].includes(e.reason))o.reason=e.reason;
 if(['P0001','23503','23505','23514','42501'].includes(e.dbCode))o.dbCode=e.dbCode;
 if(Object.values(TRIGGERS).some(x=>x.logical===e.trigger))o.trigger=e.trigger;
 if(Number.isInteger(e.status)&&e.status>=100&&e.status<=599)o.status=e.status;return o;}
export function validateOwnershipConfig(env,now=Date.now()){
 if(env.EDUCATIVO_OWNERSHIP_TEST!=='confirmed')stop({phase:'config',reason:'invalid_state'});
 for(const k of Object.keys(env))if(/^EDUCATIVO_(?:PLANTEL|GRADO|MATERIA|UNIDAD|TEMA|PLANEACION)_ID$/.test(k)&&env[k])stop({phase:'config',reason:'invalid_state'});
 return validateBibliotecaConfig({...env,EDUCATIVO_API_URL:'http://127.0.0.1:3000',EDUCATIVO_LOCAL_API_VERIFIED:'confirmed'},now);
}
function timeoutFactory(ms){const c=new AbortController();let hit=false;const t=setTimeout(()=>{hit=true;c.abort()},ms);return{signal:c.signal,didTimeout:()=>hit,clear:()=>clearTimeout(t)}}
function payload(table,actor,ids,config,runId){const s=SPEC[table],p={id:ids[actor][table],user_id:config.actors[actor].id,[s.marker]:markerFor(runId,actor,table,s.role)};
 if(s.relation)p[s.relation]=ids[actor][s.parent];if(table==='grados')p.nivel_base='Primaria';if(table==='unidades'||table==='temas')p.orden=1;if(table==='planeaciones'){p.status='ready';p.actividades_momentos={};}return p;}

export function createOwnershipHarness(env,{fetchImpl=globalThis.fetch,emit=()=>{},now=Date.now,uuid=randomUUID,timeoutControlFactory=timeoutFactory}={}){
 const config=validateOwnershipConfig(env,now()),runId=uuid().toLowerCase(),ids={A:{},B:{}},ledger=new Map(),uncertain=new Map(),reported=new Set();
 for(const a of ['A','B']){for(const t of TABLES)ids[a][t]=t==='planeaciones'?planeacionIdFromUuid(runId,a==='A'?41:42):uuid().toLowerCase();}
 let prepared=false,executeCompleted=false,cleanupCompleted=false,phase=null,commandErrors=0;const counts={pass:0,fail:0,inconclusive:0};
 const report=e=>emit(safeOwnershipEvent(e));report({caseId:'RUN'});const key=(t,id)=>`${t}:${id}`;
 async function request(path,actor,method='GET',body){validateOwnershipConfig(env,now());const u=new URL(path,OWNERSHIP_TEST_URL);if(u.origin!==OWNERSHIP_TEST_URL||u.username||u.password)stop({phase,actor,reason:'invalid_state'});const tc=timeoutControlFactory(15000);try{const h={apikey:config.key,Authorization:`Bearer ${config.actors[actor].token}`,'Content-Type':'application/json'};if(method!=='GET')h.Prefer=method==='DELETE'?'return=minimal':'return=representation';const r=await fetchImpl(u.href,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:tc.signal});if(r.redirected||(r.url&&new URL(r.url).origin!==OWNERSHIP_TEST_URL)||(r.status>=300&&r.status<400))stop({phase,actor,reason:'unexpected_response',status:r.status});let data=null;if(r.status!==204){try{data=await r.json()}catch{stop({phase,actor,reason:'invalid_json',status:r.status})}}return{ok:r.ok,status:r.status,data};}catch(e){if(e instanceof OwnershipError)throw e;stop({phase,actor,reason:tc.didTimeout()?'timeout':'network'})}finally{tc.clear()}}
 async function auth(){for(const a of ['A','B']){const r=await request('/auth/v1/user',a);if(!r.ok||r.data?.id?.toLowerCase()!==config.actors[a].id||r.data?.is_anonymous===true)stop({phase:'auth',actor:a,reason:'invalid_state'})}}
 async function read(t,id,a){const r=await request(`/rest/v1/${t}?id=eq.${enc(id)}&select=${enc(SPEC[t].select)}`,a);if(!r.ok||!Array.isArray(r.data))stop({phase,actor:a,table:t,reason:'unexpected_response',status:r.status});return r.data}
 const exact=(entry,row)=>String(row?.id)===entry.id&&row.user_id===config.actors[entry.actor].id&&row[SPEC[entry.table].marker]===entry.marker;
 async function absentBoth(t,id){for(const a of ['A','B'])if((await read(t,id,a)).length!==0)return false;return true}
 async function preflight(){for(const a of ['A','B'])for(const t of TABLES)if(!await absentBoth(t,ids[a][t]))stop({phase:'prepare',actor:a,table:t,reason:'invalid_state'})}
 function emitCase(caseId,result,extra={}){if(reported.has(caseId)||!OWNERSHIP_CASE_MANIFEST.some(x=>x.caseId===caseId))stop({phase,reason:'invalid_state'});reported.add(caseId);counts[result.toLowerCase()]++;report({caseId,result,...extra})}
 async function create(t,a,caseId){const p=payload(t,a,ids,config,runId),e={table:t,id:String(p.id),actor:a,marker:p[SPEC[t].marker],row:null,state:'uncertain'};uncertain.set(key(t,e.id),e);report({caseId:'UNCERTAIN',phase,actor:a,table:t,result:'PENDING'});const r=await request(`/rest/v1/${t}`,a,'POST',p);if(!r.ok)stop({phase,actor:a,table:t,reason:'http',status:r.status});const rows=await read(t,e.id,a);if(rows.length!==1||!exact(e,rows[0]))stop({phase,actor:a,table:t,reason:'unexpected_response'});e.row=rows[0];e.state='pending_delete';uncertain.delete(key(t,e.id));ledger.set(key(t,e.id),e);report({caseId:'CREATED',phase,actor:a,table:t,result:'CREATED'});if(caseId)emitCase(caseId,'PASS',{phase,actor:a,table:t})}
 async function semanticUpdate(t,a,caseId){const e=ledger.get(key(t,ids[a][t])),before=(await read(t,e.id,a))[0];const r=await request(`/rest/v1/${t}?id=eq.${enc(e.id)}&user_id=eq.${enc(config.actors[a].id)}`,a,'PATCH',{[SPEC[t].marker]:e.marker});if(!r.ok)stop({phase,actor:a,table:t,reason:'http',status:r.status});const after=(await read(t,e.id,a))[0];if(!exact(e,after)||!validTime(before.updated_at)||!validTime(after.updated_at)||Date.parse(after.updated_at)<=Date.parse(before.updated_at))stop({phase,actor:a,table:t,reason:'snapshot_changed'});e.row=after;emitCase(caseId,'PASS',{phase,actor:a,table:t})}
 async function removeEntry(e,{allowAbsent=false}={}){const own=await read(e.table,e.id,e.actor);if(own.length===0&&allowAbsent){ledger.delete(key(e.table,e.id));return true}if(own.length!==1||!exact(e,own[0]))stop({phase,actor:e.actor,table:e.table,reason:'unexpected_response'});e.state='delete_unverified';const r=await request(`/rest/v1/${e.table}?id=eq.${enc(e.id)}&user_id=eq.${enc(config.actors[e.actor].id)}`,e.actor,'DELETE');if(!r.ok)stop({phase,actor:e.actor,table:e.table,reason:'http',status:r.status});if(!await absentBoth(e.table,e.id)){report({caseId:'DIAGNOSTIC',phase,actor:e.actor,table:e.table,reason:'delete_unverified'});return false}ledger.delete(key(e.table,e.id));report({caseId:'REMOVED',phase,actor:e.actor,table:e.table,result:'REMOVED'});return true}
 async function crossUpdate(item){const t=item.table,e=ledger.get(key(t,ids.A[t])),before=(await read(t,e.id,'A'))[0],parentBefore=(await read(item.parentTable,ids.B[item.parentTable],'B'))[0];const r=await request(`/rest/v1/${t}?id=eq.${enc(e.id)}&user_id=eq.${enc(config.actors.A.id)}`,'A','PATCH',{[item.relation]:ids.B[item.parentTable]});const after=(await read(t,e.id,'A'))[0],parentAfter=(await read(item.parentTable,ids.B[item.parentTable],'B'))[0];if(stable(parentBefore)!==stable(parentAfter)){emitCase(caseId(item,'UPDATE-CROSS-A'),'INCONCLUSIVE',{phase,actor:'A',table:t,reason:'snapshot_changed'});stop({phase,actor:'B',table:item.parentTable,reason:'snapshot_changed'})}if(r.ok&&after?.[item.relation]===ids.B[item.parentTable]){emitCase(caseId(item,'UPDATE-CROSS-A'),'FAIL',{phase,actor:'A',table:t,reason:'relation_persisted',status:r.status});const rr=await request(`/rest/v1/${t}?id=eq.${enc(e.id)}&user_id=eq.${enc(config.actors.A.id)}`,'A','PATCH',{[item.relation]:before[item.relation]});const restored=(await read(t,e.id,'A'))[0];if(!rr.ok||stable({...restored,updated_at:before.updated_at})!==stable(before))stop({phase,actor:'A',table:t,reason:'snapshot_changed'});e.row=restored;return}const c=classifyOwnershipP0001(r.data,t);if(!r.ok&&c.kind==='expected'&&stable(after)===stable(before)){emitCase(caseId(item,'UPDATE-CROSS-A'),'PASS',{phase,actor:'A',table:t,reason:'expected_trigger',dbCode:c.dbCode,trigger:c.trigger,status:r.status});return}emitCase(caseId(item,'UPDATE-CROSS-A'),'INCONCLUSIVE',{phase,actor:'A',table:t,reason:'wrong_rejection',dbCode:c.dbCode,status:r.status})}
 function caseId(item,suffix){const code=item.table==='planeaciones'?'PLANEACION':item.table.slice(0,-1).toUpperCase();return `03D3C1-OWN-${code}-${suffix}`}
 async function crossInsert(item){const t=item.table,e=ledger.get(key(t,ids.A[t]));if(!await removeEntry(e))stop({phase,actor:'A',table:t,reason:'delete_unverified'});const p=payload(t,'A',ids,config,runId);p[item.relation]=ids.B[item.parentTable];const pending={table:t,id:String(p.id),actor:'A',marker:p[SPEC[t].marker],row:null,state:'uncertain'};uncertain.set(key(t,p.id),pending);report({caseId:'UNCERTAIN',phase,actor:'A',table:t,result:'PENDING'});const parentBefore=(await read(item.parentTable,ids.B[item.parentTable],'B'))[0],r=await request(`/rest/v1/${t}`,'A','POST',p),own=await read(t,p.id,'A'),parentAfter=(await read(item.parentTable,ids.B[item.parentTable],'B'))[0];if(stable(parentBefore)!==stable(parentAfter))stop({phase,actor:'B',table:item.parentTable,reason:'snapshot_changed'});if(r.ok&&own.length===1&&own[0][item.relation]===ids.B[item.parentTable]){pending.row=own[0];pending.state='pending_delete';uncertain.delete(key(t,p.id));ledger.set(key(t,p.id),pending);emitCase(caseId(item,'CREATE-CROSS-A'),'FAIL',{phase,actor:'A',table:t,reason:'relation_persisted',status:r.status});if(!await removeEntry(pending))stop({phase,actor:'A',table:t,reason:'delete_unverified'});return}const c=classifyOwnershipP0001(r.data,t);if(!r.ok&&c.kind==='expected'&&own.length===0){uncertain.delete(key(t,p.id));emitCase(caseId(item,'CREATE-CROSS-A'),'PASS',{phase,actor:'A',table:t,reason:'expected_trigger',dbCode:c.dbCode,trigger:c.trigger,status:r.status});return}if(!r.ok&&['23503','23505','23514','42501'].includes(r.data?.code))uncertain.delete(key(t,p.id));emitCase(caseId(item,'CREATE-CROSS-A'),'INCONCLUSIVE',{phase,actor:'A',table:t,reason:'wrong_rejection',dbCode:c.dbCode,status:r.status})}
 async function prepare(){phase='prepare';await auth();await preflight();for(const t of TABLES)for(const a of ['A','B']){const item=OWNERSHIP_FUNCTIONS.find(x=>x.table===t);await create(t,a,item?caseId(item,`CREATE-${a}`):null)}prepared=true;phase=null}
 async function execute(){if(!prepared)stop({phase:'execute',reason:'invalid_state'});phase='execute';for(const item of OWNERSHIP_FUNCTIONS)await semanticUpdate(item.table,'A',caseId(item,'UPDATE-A'));await semanticUpdate('planteles','A','03D3C1-UPDATED-PLANTEL-A');await semanticUpdate('unidades','A','03D3C1-UPDATED-UNIDAD-A');for(const item of OWNERSHIP_FUNCTIONS)await crossUpdate(item);
 // Bottom-up reuse of A IDs keeps recovery cardinality at <=2 rows/table.
 for(const t of ['planeaciones','temas'])await crossInsert(OWNERSHIP_FUNCTIONS.find(x=>x.table===t));await removeEntry(ledger.get(key('unidades',ids.A.unidades)));for(const t of ['materias','grados'])await crossInsert(OWNERSHIP_FUNCTIONS.find(x=>x.table===t));executeCompleted=OWNERSHIP_CASE_MANIFEST.every(x=>reported.has(x.caseId));phase=null}
 async function cleanup(){phase='cleanup';await auth();for(const t of CLEANUP_ORDER)for(const a of ['A','B']){const e=ledger.get(key(t,ids[a][t]));if(e&&!await removeEntry(e,{allowAbsent:true}))stop({phase,actor:a,table:t,reason:'delete_unverified'})}cleanupCompleted=ledger.size===0&&uncertain.size===0;phase=null}
 function state(){return{runId,prepared,executeCompleted,cleanupCompleted,...counts,commandErrors,fixturesPending:[...ledger.values()].map(x=>({actor:x.actor,table:x.table,state:x.state})),uncertainPending:[...uncertain.values()].map(x=>({actor:x.actor,table:x.table})),successful:prepared&&executeCompleted&&cleanupCompleted&&counts.pass===22&&!counts.fail&&!counts.inconclusive&&!commandErrors&&!ledger.size&&!uncertain.size}}
 const recordCommandError=()=>{commandErrors++};
 return Object.freeze({prepare,execute,cleanup,state,recordCommandError,ids:Object.freeze(ids)});
}
export const ownershipExitCode=s=>s.successful?0:1;
