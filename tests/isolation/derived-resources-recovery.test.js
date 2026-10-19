import test from 'node:test';
import assert from 'node:assert/strict';
import { RECOVERY_TEST_URL,validateRecoveryConfig,safeRecoveryEvent,createDerivedRecovery,recoveryExitCode } from './derived-resources-recovery.js';

const NOW=Date.UTC(2030,0,1),run='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ids={A:'11111111-1111-4111-8111-111111111111',B:'22222222-2222-4222-8222-222222222222',unitA:'33333333-3333-4333-8333-333333333333',unitB:'44444444-4444-4444-8444-444444444444'};
const jwt=p=>`x.${Buffer.from(JSON.stringify(p)).toString('base64url')}.x`;
function env(over={}){const e={APP_ENV:'test',SUPABASE_URL:RECOVERY_TEST_URL,EDUCATIVO_PUBLIC_KEY:'sb_publishable_synthetic',EDUCATIVO_SYNTHETIC_USERS:'confirmed',EDUCATIVO_RECOVERY_RUN_ID:run};for(const a of ['A','B']){e[`EDUCATIVO_${a}_ID`]=ids[a];e[`EDUCATIVO_${a}_TOKEN`]=jwt({sub:ids[a],role:'authenticated',iss:`${RECOVERY_TEST_URL}/auth/v1`,exp:Math.floor(NOW/1000)+3600});}return {...e,...over};}
const noTimer=()=>({signal:undefined,didTimeout:()=>false,clear(){}});
const uid=n=>`${(0x60000000+n).toString(16)}-0000-4000-8000-${String(n).padStart(12,'0')}`;
const mark=(actor,table,suffix)=>`Educativo IA 03D2B ${run} ${actor} ${table} ${suffix}`;
function incident({uncertain=false,uncertainAmbiguous=false,unexpected=false,tooMany=false,ownerLeak=false,external=false,ambiguousDelete=false}={}){
  const stores=Object.fromEntries(['planeacion_batches','planeaciones','anexos','listas_cotejo','examenes'].map(t=>[t,new Map()])),calls=[];
  const ba=uid(1),bb=uid(2),pa='100000000000010',pb='100000000000011';
  const put=(t,r)=>stores[t].set(String(r.id),structuredClone(r));
  put('planeacion_batches',{id:ba,user_id:ids.A,titulo:mark('A','planeacion_batches','precondition'),plantel_id:null,grado_id:null,materia_id:null,unidad_id:null});
  put('planeacion_batches',{id:bb,user_id:ids.B,titulo:mark('B','planeacion_batches','precondition'),plantel_id:null,grado_id:null,materia_id:null,unidad_id:null});
  put('planeaciones',{id:pa,user_id:ids.A,tema:mark('A','planeaciones','precondition'),batch_id:ba,tema_id:null});
  put('planeaciones',{id:pb,user_id:ids.B,tema:mark('B','planeaciones','precondition'),batch_id:bb,tema_id:null});
  for(const [i,s] of ['target-anexo-insert','target-anexo-update','target-lista-insert','target-lista-update'].entries())put('planeaciones',{id:String(100000000000021+i),user_id:ids.B,tema:mark('B','planeaciones',s),batch_id:bb,tema_id:null});
  for(const [i,t] of ['anexos','listas_cotejo','examenes'].entries())for(const a of ['A','B']){const own=a==='A',row={id:uid(10+i*2+(own?0:1)),user_id:ids[a],titulo:mark(a,t,'base'),batch_id:own?ba:bb};if(t==='examenes'){row.unidad_id=own?ids.unitA:ids.unitB;row.generation_job_id=null;row.plantel_id=null;row.grado_id=null;row.materia_id=null;}else{row.planeacion_id=own?pa:pb;row.tema_id=null;row.unidad_id=null;}put(t,row);}
  put('anexos',{id:uid(30),user_id:ids.A,titulo:mark('A','anexos','adversarial'),planeacion_id:'100000000000021',batch_id:ba,tema_id:null,unidad_id:null});
  if(uncertain)put('anexos',{id:uid(31),user_id:ids.A,titulo:mark('A','anexos','delete'),planeacion_id:pa,batch_id:ba,tema_id:null,unidad_id:null});
  if(uncertainAmbiguous){put('anexos',{id:uid(31),user_id:ids.A,titulo:mark('A','anexos','delete'),planeacion_id:pa,batch_id:ba,tema_id:null,unidad_id:null});put('anexos',{id:uid(33),user_id:ids.A,titulo:mark('A','anexos','delete'),planeacion_id:pa,batch_id:ba,tema_id:null,unidad_id:null});}
  if(unexpected)put('anexos',{id:uid(32),user_id:ids.A,titulo:`Educativo IA 03D2B ${run} A anexos evil`,planeacion_id:pa,batch_id:ba,tema_id:null,unidad_id:null});
  if(tooMany)for(let i=0;i<9;i++)put('anexos',{id:uid(40+i),user_id:ids.A,titulo:mark('A','anexos','adversarial'),planeacion_id:pa,batch_id:ba,tema_id:null,unidad_id:null});
  if(external)put('anexos',{id:uid(90),user_id:ids.A,titulo:'preexisting',planeacion_id:pa,batch_id:ba,tema_id:null,unidad_id:null});
  let ambiguous=ambiguousDelete;
  const response=(data,status=200)=>({ok:status>=200&&status<300,status,redirected:false,url:'',json:async()=>data});
  const actor=o=>JSON.parse(Buffer.from(o.headers.Authorization.slice(7).split('.')[1],'base64url')).sub;
  const fetchImpl=async(address,o)=>{const u=new URL(address),a=actor(o),method=o.method||'GET';calls.push({path:u.pathname,method,query:u.search});if(u.pathname==='/auth/v1/user')return response({id:a,is_anonymous:false});const table=u.pathname.split('/').at(-1),store=stores[table];if(!store)throw Error('route');if(method==='GET'){let rows=[...store.values()].filter(r=>r.user_id===a);const id=u.searchParams.get('id')?.slice(3);if(id)rows=rows.filter(r=>String(r.id)===id);for(const f of ['planeacion_id','batch_id']){const v=u.searchParams.get(f)?.slice(3);if(v)rows=rows.filter(r=>String(r[f])===v);}const markerField=table==='planeaciones'?'tema':'titulo',like=u.searchParams.get(markerField);if(like)rows=rows.filter(r=>String(r[markerField]).startsWith(like.slice(5).replace(/\*$/,'')));if(ownerLeak&&table==='anexos'&&a===ids.B)rows.push([...stores.anexos.values()][0]);return response(structuredClone(rows));}const id=u.searchParams.get('id')?.slice(3),row=store.get(id);if(method==='DELETE'&&row?.user_id===a){store.delete(id);if(ambiguous){ambiguous=false;throw Error('provider token signed-url canary');}return response(null,204);}return response(null,204);};
  return {fetchImpl,stores,calls};
}

test('valid config accepts only runId and actor credentials',()=>assert.equal(validateRecoveryConfig(env(),NOW).runId,run));
test('invalid runId is rejected',()=>assert.throws(()=>validateRecoveryConfig(env({EDUCATIVO_RECOVERY_RUN_ID:'bad'}),NOW)));
test('external row IDs are rejected',()=>assert.throws(()=>validateRecoveryConfig(env({EDUCATIVO_FIXTURE_ID:uid(99)}),NOW)));
test('construction and imports perform no I/O',()=>{let calls=0;createDerivedRecovery(env(),{fetchImpl:async()=>{calls++;},now:()=>NOW,timeoutControlFactory:noTimer});assert.equal(calls,0);});
test('sanitizer removes credentials, row IDs and raw errors',()=>{const x=safeRecoveryEvent({caseId:'DIAGNOSTIC',phase:'recover',reason:'network',token:'Bearer canary',id:uid(1),unit_id:ids.unitA,body:'secret'});assert.deepEqual(x,{caseId:'DIAGNOSTIC',phase:'recover',reason:'network'});assert.doesNotMatch(JSON.stringify(x),/canary|secret|33333333|60000001/);});
test('exact incident graph is reconstructed and fully removed',async()=>{const f=incident(),events=[],r=createDerivedRecovery(env(),{fetchImpl:f.fetchImpl,emit:e=>events.push(e),now:()=>NOW,timeoutControlFactory:noTimer});const d=await r.discover();assert.equal(d.discovered,15);assert.equal(d.absentConfirmed,1);const done=await r.recover();assert.equal(done.removed,15);assert.equal(done.fixturesPending,0);assert.equal(done.successful,true);assert.equal(recoveryExitCode(done),0);assert.ok(f.calls.filter(x=>x.method==='DELETE').every(x=>!x.path.endsWith('/unidades')));});
test('valid uncertain delete fixture is discovered and removed',async()=>{const f=incident({uncertain:true}),r=createDerivedRecovery(env(),{fetchImpl:f.fetchImpl,now:()=>NOW,timeoutControlFactory:noTimer});const d=await r.discover();assert.equal(d.absentConfirmed,0);assert.equal(d.discovered,16);assert.equal((await r.recover()).successful,true);});
test('ambiguous uncertain marker fails closed without DELETE',async()=>{const f=incident({uncertainAmbiguous:true}),r=createDerivedRecovery(env(),{fetchImpl:f.fetchImpl,now:()=>NOW,timeoutControlFactory:noTimer});await assert.rejects(r.discover(),e=>e.diagnostic.reason==='ambiguous_fixture');assert.equal(f.calls.some(x=>x.method==='DELETE'),false);});
test('unexpected marker fails closed',async()=>{const f=incident({unexpected:true}),r=createDerivedRecovery(env(),{fetchImpl:f.fetchImpl,now:()=>NOW,timeoutControlFactory:noTimer});await assert.rejects(r.discover(),e=>e.diagnostic.reason==='unexpected_marker');});
test('too many rows fails closed',async()=>{const f=incident({tooMany:true}),r=createDerivedRecovery(env(),{fetchImpl:f.fetchImpl,now:()=>NOW,timeoutControlFactory:noTimer});await assert.rejects(r.discover(),e=>e.diagnostic.reason==='too_many_rows');});
test('owner incoherence fails closed',async()=>{const f=incident({ownerLeak:true}),r=createDerivedRecovery(env(),{fetchImpl:f.fetchImpl,now:()=>NOW,timeoutControlFactory:noTimer});await assert.rejects(r.discover(),e=>['owner_mismatch','ambiguous_fixture'].includes(e.diagnostic.reason));});
test('external dependent blocks deletion',async()=>{const f=incident({external:true}),r=createDerivedRecovery(env(),{fetchImpl:f.fetchImpl,now:()=>NOW,timeoutControlFactory:noTimer});await r.discover();await assert.rejects(r.recover(),e=>e.diagnostic.reason==='external_dependent');assert.equal(r.state().successful,false);});
test('ambiguous DELETE can be retried and confirmed absent',async()=>{const f=incident({ambiguousDelete:true}),r=createDerivedRecovery(env(),{fetchImpl:f.fetchImpl,now:()=>NOW,timeoutControlFactory:noTimer});await r.discover();await assert.rejects(r.recover());assert.equal(r.state().deleteUnverified,1);const done=await r.recover();assert.equal(done.fixturesPending,0);assert.equal(done.successful,false);assert.equal(recoveryExitCode(done),1);});
