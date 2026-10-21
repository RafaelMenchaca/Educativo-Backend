import test from 'node:test';
import assert from 'node:assert/strict';
import { OWNER_CONSTRAINT_BY_CASE, OWNER_CONSTRAINTS, extractOwnerConstraint, classifyOwnerConstraintRejection } from './owner-constraint-errors.js';
import { BIBLIOTECA_CASE_MANIFEST, safeBibliotecaEvent } from './biblioteca-harness.js';
import { DERIVED_CASE_MANIFEST, safeDerivedEvent } from './derived-resources-harness.js';
import { TECHNICAL_CASE_MANIFEST, safeTechnicalEvent } from './technical-jobs-harness.js';

const caseId='03D2A-SB-PLAN-CREATE-CROSS-BATCH-A';
const expected=OWNER_CONSTRAINT_BY_CASE[caseId];
const messageFor=name=>'insert or update on table "planeaciones" violates foreign key constraint "'+name+'"';
const response=(code='23503',message=messageFor(expected),extra={})=>({data:{code,message,...extra}});

test('exact expected owner constraint plus clean snapshots passes',()=>assert.deepEqual(classifyOwnerConstraintRejection({caseId,response:response(),snapshotClean:true}),{result:'PASS',reason:'owner_constraint',dbCode:'23503',constraint:expected}));
test('another allowlisted owner constraint remains inconclusive',()=>assert.equal(classifyOwnerConstraintRejection({caseId,response:response('23503',messageFor(OWNER_CONSTRAINTS[1])),snapshotClean:true}).result,'INCONCLUSIVE'));
test('historical, unknown and unnamed foreign keys remain inconclusive',()=>{for(const message of [messageFor('planeaciones_batch_id_fkey'),messageFor('unknown_fkey'),'foreign key violation'])assert.equal(classifyOwnerConstraintRejection({caseId,response:response('23503',message),snapshotClean:true}).result,'INCONCLUSIVE')});
test('unique and check violations remain inconclusive',()=>{assert.equal(classifyOwnerConstraintRejection({caseId,response:response('23505','duplicate'),snapshotClean:true}).result,'INCONCLUSIVE');assert.equal(classifyOwnerConstraintRejection({caseId,response:response('23514','check'),snapshotClean:true}).result,'INCONCLUSIVE')});
test('partial and malicious textual mentions are never extracted',()=>{assert.equal(extractOwnerConstraint({message:'prefix '+expected+' suffix'}),null);assert.equal(extractOwnerConstraint({message:messageFor(expected+'_suffix')}),null)});
test('multiple recognizable constraint sources fail closed',()=>assert.equal(extractOwnerConstraint({constraint:expected,message:messageFor(expected)}),null));
test('correct constraint without clean snapshots is inconclusive',()=>assert.equal(classifyOwnerConstraintRejection({caseId,response:response(),snapshotClean:false}).result,'INCONCLUSIVE'));
test('non-relational case cannot use owner-constraint exception',()=>assert.equal(classifyOwnerConstraintRejection({caseId:'03D2A-SB-PLAN-READ-OWN-A',response:response(),snapshotClean:true}).result,'INCONCLUSIVE'));
test('all and only relational manifest cases have one exact mapping',()=>{const manifests=[...BIBLIOTECA_CASE_MANIFEST,...DERIVED_CASE_MANIFEST,...TECHNICAL_CASE_MANIFEST];const ids=new Set(manifests.map(x=>x.caseId));assert.equal(Object.keys(OWNER_CONSTRAINT_BY_CASE).length,19);for(const [id,constraint] of Object.entries(OWNER_CONSTRAINT_BY_CASE)){assert.ok(ids.has(id));assert.ok(OWNER_CONSTRAINTS.includes(constraint))}for(const item of manifests)if(!Object.hasOwn(OWNER_CONSTRAINT_BY_CASE,item.caseId))assert.equal(OWNER_CONSTRAINT_BY_CASE[item.caseId],undefined)});
test('sanitizers retain allowlisted diagnostics and drop raw provider fields',()=>{const event={caseId:'DIAGNOSTIC',phase:'execute',actor:'A',reason:'owner_constraint',dbCode:'23503',constraint:expected,message:'SECRET',details:'SECRET',hint:'SECRET',raw:{secret:true}};for(const safe of [safeBibliotecaEvent,safeDerivedEvent,safeTechnicalEvent]){const out=safe(event);assert.equal(out.constraint,expected);assert.equal(out.dbCode,'23503');for(const field of ['message','details','hint','raw'])assert.equal(Object.hasOwn(out,field),false)}});
