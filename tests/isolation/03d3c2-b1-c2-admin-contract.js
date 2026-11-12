// Pure B1-C2 administrative fixture contract. Importing performs no I/O.
import { randomUUID } from 'node:crypto';

export const B1C2_TEST_URL = 'https://gwdtlbisykzzplgzczzq.supabase.co';
export const B1C2_PROJECT_REF = 'gwdtlbisykzzplgzczzq';
export const B1C2_PROJECT_CONFIRMATION = 'educativo-backend-test';
export const B1C2_TABLES = Object.freeze(['planeacion_batches','examenes','examen_generation_jobs','examen_generation_items']);
export const B1C2_MUTATIONS = Object.freeze(['INSERT planeacion_batches','INSERT examenes','DELETE examen_generation_jobs']);
export const B1C2_MAX = Object.freeze({planeacion_batches:2,examenes:2,examen_generation_jobs:4,examen_generation_items:6});
export const B1C2_ROLES = Object.freeze({planeacion_batches:['base'],examenes:['base'],examen_generation_jobs:['base','item-update-target'],examen_generation_items:['base','delete','cross']});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class B1C2ConfigError extends Error { constructor(code){super(code);this.name='B1C2ConfigError';this.code=code;} }
const claims=value=>{try{return JSON.parse(Buffer.from(value.split('.')[1],'base64url').toString())}catch{return null}};
export function validateB1C2AdminConfig(input={}){
  const allowed=['APP_ENV','SUPABASE_URL','PROJECT_CONFIRMATION','ADMIN_KEY','A_USER_ID','B_USER_ID','A_UNIT_ID','B_UNIT_ID'];
  if(Object.keys(input).some(k=>!allowed.includes(k)))throw new B1C2ConfigError('forbidden_config_input');
  if(input.APP_ENV!=='test'||input.SUPABASE_URL!==B1C2_TEST_URL)throw new B1C2ConfigError('invalid_environment');
  if(input.PROJECT_CONFIRMATION!==B1C2_PROJECT_CONFIRMATION)throw new B1C2ConfigError('invalid_project_confirmation');
  const key=input.ADMIN_KEY;
  if(typeof key!=='string'||!key||/\s/.test(key))throw new B1C2ConfigError('invalid_admin_credential');
  if(/^sb_(?:publishable|public)_/i.test(key))throw new B1C2ConfigError('public_credential_forbidden');
  if(!/^sb_secret_[A-Za-z0-9_-]+$/.test(key)){
    const c=claims(key);if(c?.role!=='service_role'||c?.ref!==B1C2_PROJECT_REF)throw new B1C2ConfigError('invalid_admin_credential');
  }
  for(const k of ['A_USER_ID','B_USER_ID','A_UNIT_ID','B_UNIT_ID'])if(!UUID.test(input[k]||''))throw new B1C2ConfigError('invalid_context_id');
  if(input.A_USER_ID===input.B_USER_ID||input.A_UNIT_ID===input.B_UNIT_ID)throw new B1C2ConfigError('context_not_distinct');
  return Object.freeze({url:B1C2_TEST_URL,key,actors:Object.freeze({A:Object.freeze({userId:input.A_USER_ID.toLowerCase(),unitId:input.A_UNIT_ID.toLowerCase()}),B:Object.freeze({userId:input.B_USER_ID.toLowerCase(),unitId:input.B_UNIT_ID.toLowerCase()})})});
}
export const markerFor=(runId,actor,table,role)=>`EIA-03D3C2-B1C2:${runId}:${actor}:${table}:${role}`;
export function parseMarker(value,runId){const m=/^EIA-03D3C2-B1C2:([0-9a-f-]{36}):(A|B):([a-z_]+):([a-z-]+)$/.exec(value||'');if(!m||m[1]!==runId||!B1C2_TABLES.includes(m[3])||!B1C2_ROLES[m[3]]?.includes(m[4]))return null;return{runId:m[1],actor:m[2],table:m[3],role:m[4]}}
export function newFixtureManifest(config,{runId=randomUUID(),uuid=randomUUID,now=Date.now,ttlMs=30*60*1000}={}){if(!UUID.test(runId))throw new B1C2ConfigError('invalid_run_id');const rows=[];for(const actor of ['A','B']){const batchId=uuid(),examId=uuid();rows.push(Object.freeze({table:'planeacion_batches',id:batchId,actor,owner:config.actors[actor].userId,role:'base',marker:markerFor(runId,actor,'planeacion_batches','base')}));rows.push(Object.freeze({table:'examenes',id:examId,actor,owner:config.actors[actor].userId,unitId:config.actors[actor].unitId,batchId,role:'base',marker:markerFor(runId,actor,'examenes','base')}))}const createdAt=now();return Object.freeze({runId,createdAt,expiresAt:createdAt+ttlMs,rows:Object.freeze(rows)})}
export function safeB1C2Event(e={}){const o={};if(['RUN','DIAGNOSTIC','PENDING','UNCERTAIN','CREATED','REMOVED','PASS','FAIL','INCONCLUSIVE','SUMMARY'].includes(e.event))o.event=e.event;if(UUID.test(e.runId||''))o.runId=e.runId;if(['A','B'].includes(e.actor))o.actor=e.actor;if(B1C2_TABLES.includes(e.table))o.table=e.table;if(['INSERT','DELETE','SELECT'].includes(e.operation))o.operation=e.operation;if(['config','preflight','prepare','verify','cleanup','discover','recover'].includes(e.phase))o.phase=e.phase;if(['PASS','FAIL','INCONCLUSIVE','PENDING','CREATED','REMOVED'].includes(e.result))o.result=e.result;if(['invalid_environment','invalid_project_confirmation','invalid_admin_credential','public_credential_forbidden','forbidden_config_input','invalid_context_id','context_not_distinct','unexpected_response','fixture_exists','context_mismatch','cardinality','marker_mismatch','owner_mismatch','graph_open','external_dependent','write_uncertain','delete_unverified','invalid_state'].includes(e.reason))o.reason=e.reason;if(Number.isInteger(e.status)&&e.status>=100&&e.status<=599)o.status=e.status;for(const k of ['authenticatedCleanupPending','uncertainPending','jobsRemoved'])if(Number.isInteger(e[k])&&e[k]>=0)o[k]=e[k];if(typeof e.successful==='boolean')o.successful=e.successful;return o}
export function sanitizedExchange(manifest){return Object.freeze({runId:manifest.runId,createdAt:manifest.createdAt,expiresAt:manifest.expiresAt,fixtures:Object.freeze(manifest.rows.map(({table,id,actor,marker,batchId})=>Object.freeze({table,id,actor,marker,...(batchId?{batchId}:{})})))})}
export function validateHarnessExchange(exchange,{now=Date.now(),expectedRunId,observedRows}={}){if(!exchange||exchange.runId!==expectedRunId||!UUID.test(exchange.runId)||!Number.isSafeInteger(exchange.expiresAt)||now>=exchange.expiresAt)return{ok:false,reason:'expired_or_wrong_run'};if(!Array.isArray(exchange.fixtures)||exchange.fixtures.length!==4||exchange.fixtures.some(x=>!parseMarker(x.marker,exchange.runId)))return{ok:false,reason:'invalid_manifest'};if(Array.isArray(observedRows)&&exchange.fixtures.some(x=>!observedRows.some(r=>r.id===x.id)))return{ok:false,reason:'already_cleaned'};return{ok:true}}
