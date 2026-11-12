import assert from 'node:assert/strict';
import test from 'node:test';
import {B0_ANON_CASES,classifyPostB0AnonRejection,normalizeB0CurrentMode} from './b0-current-anon-errors.js';
import fs from 'node:fs';

test('manifest contains exactly the 26 direct PostgREST anon cases',()=>{
 assert.equal(Object.keys(B0_ANON_CASES).length,26);
 assert.ok(Object.values(B0_ANON_CASES).every(x=>x.actor==='anon'&&['SELECT','INSERT','UPDATE','DELETE'].includes(x.operation)));
 assert.ok(!Object.hasOwn(B0_ANON_CASES,'03D2A-API-ANON'));
});
test('pre-B0 mode preserves legacy classification',()=>assert.deepEqual(classifyPostB0AnonRejection({mode:'pre_b0'}),{result:'legacy'}));
test('exact post-B0 42501 with clean snapshots passes',()=>{
 const result=classifyPostB0AnonRejection({mode:'post_b0_current',caseId:'03D2A-SB-PLAN-EDIT-ANON',actor:'anon',table:'planeaciones',operation:'UPDATE',response:{ok:false,data:{code:'42501',message:'canary'}},snapshotClean:true,uncertainPending:false});
 assert.deepEqual(result,{result:'PASS',reason:'b0_grant_revoked',dbCode:'42501'});
 assert.doesNotMatch(JSON.stringify(result),/canary/);
});
test('non-anon, wrong operation, dirty snapshot and ambiguity cannot pass',()=>{
 const base={mode:'post_b0_current',caseId:'03D2A-SB-PLAN-EDIT-ANON',actor:'anon',table:'planeaciones',operation:'UPDATE',response:{ok:false,data:{code:'42501'}},snapshotClean:true,uncertainPending:false};
 for(const override of [{actor:'A'},{operation:'DELETE'},{snapshotClean:false},{uncertainPending:true},{response:{ok:false,data:{}}},{response:{ok:true,data:{code:'42501'}}}])
  assert.equal(classifyPostB0AnonRejection({...base,...override}).result,'INCONCLUSIVE');
});
test('mode is exact and fail-closed',()=>{
 assert.equal(normalizeB0CurrentMode(), 'pre_b0');
 assert.throws(()=>normalizeB0CurrentMode('post-b0'),/invalid_b0_current_mode/);
});
test('classifier is connected only to 03D2A/B/C direct-table harnesses',()=>{
 for(const file of ['biblioteca-harness.js','derived-resources-harness.js','technical-jobs-harness.js']){
  const source=fs.readFileSync(new URL(file,import.meta.url),'utf8');
  assert.match(source,/normalizeB0CurrentMode\(env\.EIA_B0_CURRENT_MODE\)/);
  assert.match(source,/classifyPostB0AnonRejection/);
 }
 const ownership=fs.readFileSync(new URL('03d3c1-ownership-harness.js',import.meta.url),'utf8');
 assert.doesNotMatch(ownership,/classifyPostB0AnonRejection|EIA_B0_CURRENT_MODE/);
});
