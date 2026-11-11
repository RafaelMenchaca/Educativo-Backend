import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, PRODUCTION_PREFLIGHT, CLASSES, parseOwners, fingerprint, inventoryFromDoc, validateInventory, validateAudit, validateProductionPreflight, buildPreflight, ALLOWLIST, transitionPolicies, buildMutation, buildRolePreflight, IMMEDIATE_PREDICATES, immediateApproval } from '../../scripts/validate-03d3c2-b3-audit.js';
import { analyzeFunctionCalls } from '../../scripts/validate-03d3c2-b0-current-sql.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = Object.fromEntries(Object.entries(FILES).map(([k,p]) => [k,fs.readFileSync(path.join(root,p),'utf8')]));
const owner = parseOwners(files.source,files.b0,files.b2);
const rows = inventoryFromDoc(files.doc);
const replaceRows = values => files.doc.replace(/(<!-- B3-INVENTORY -->\s*```json\s*)[\s\S]*?(```\s*<!-- \/B3-INVENTORY -->)/,(_,a,b) => a+JSON.stringify(values)+'\n'+b);

test('49 full policy identities; 19 tables, including legacy without policy', () => {
  assert.deepEqual(validateAudit(files).errors, []);
  assert.equal(owner.tables.length,19);
  assert.equal(owner.policies.length,49);
  assert.equal(new Set(rows.map(r=>`${r.schema}.${r.table}.${r.name}`)).size,49);
  assert.equal(new Set(rows.map(r=>r.table)).size,18);
  assert.ok(owner.tables.includes('ia_metrics_legacy'));
  assert.equal(rows.filter(r=>r.table==='ia_metrics_legacy').length,0);
  assert.equal(rows.filter(r=>r.roles.join(',')==='public').length,48);
  assert.deepEqual(rows.filter(r=>r.roles.join(',')==='authenticated').map(r=>[r.table,r.command]),[['ai_model_prices','SELECT']]);
  assert.equal(rows.filter(r=>r.table==='planeaciones').length,5);
  assert.equal(rows.find(r=>r.name==='update own planeaciones').check,null);
});

test('classification is total, exclusive, and exactly matches the reviewed allowlist', () => {
  const result=validateAudit(files);
  assert.deepEqual(result.classifications,{NARROW_CANDIDATE:26,KEEP_PUBLIC:0,ALREADY_AUTHENTICATED:1,DECISION_REQUIRED:0,LEGACY_OR_DEFERRED:22});
  assert.equal(Object.values(result.classifications).reduce((a,b)=>a+b,0),49);
  assert.ok(rows.every(r=>CLASSES.includes(r.classification)&&r.future_allowlist===(r.classification==='NARROW_CANDIDATE')));
  assert.equal(rows.filter(r=>r.previous_classification==='DECISION_REQUIRED').length,24);
  assert.equal(rows.filter(r=>r.previous_classification==='NARROW_CANDIDATE').length,2);
  assert.deepEqual(rows.filter(r=>r.future_allowlist).map(r=>`${r.schema}.${r.table}.${r.name}`),ALLOWLIST);
  for(const r of rows.filter(r=>r.classification==='NARROW_CANDIDATE')) {
    assert.equal(r.anon_dependency,false);
    assert.equal(r.non_bypass_consumer,'authenticated');
    assert.match(r.authority,/BYPASSRLS observado/);
    assert.match(r.regression,/03D/);
    assert.match(r.conceptual_reversal,/solo roles PUBLIC/);
    assert.ok(r.grants.authenticated.includes(r.command==='ALL'?'SELECT':r.command));
  }
});

test('post-B0 ACL derives from initializer and versioned revocations, not counts alone', () => {
  assert.equal(owner.grants.length,335);
  assert.equal(owner.grants.filter(g=>g.includes('|anon|')).length,0);
  assert.equal(owner.grants.filter(g=>g.includes('|authenticated|')).length,69);
  assert.equal(owner.grants.filter(g=>g.includes('|service_role|')).length,133);
  assert.equal(owner.grants.filter(g=>g.includes('|postgres|')).length,133);
  assert.ok(owner.grants.includes('ai_model_prices|authenticated|SELECT'));
  assert.ok(!owner.grants.some(g=>g.startsWith('ia_metrics_legacy|authenticated|')));
  const changed=structuredClone(rows); changed[0].grants.authenticated.pop();
  assert.ok(validateInventory(owner,changed).some(e=>e.startsWith('Grant mismatch')));
});

test('complete fingerprint derives from exact definitions including NULL, order and permissiveness', () => {
  assert.equal(fingerprint(owner.policies),fingerprint([...owner.policies].reverse()));
  assert.notEqual(fingerprint(owner.policies),'221d334d3db5913257ac610efba163a9');
  assert.ok(files.preflight.includes(fingerprint(owner.policies)));
  for(const field of ['schema','table','name','command','permissive','roles','using','check']) {
    const changed=structuredClone(owner.policies);
    changed[0][field]=field==='roles'?['authenticated']:field==='using'?'true':String(changed[0][field])+' changed';
    assert.notEqual(fingerprint(changed),fingerprint(owner.policies),field);
  }
});

test('altered field in each of 49 inventory records is blocked (392 assertions)', () => {
  for(let i=0;i<49;i++) for(const field of ['schema','table','name','command','permissive','roles','using','check']) {
    const changed=structuredClone(rows);
    changed[i][field]=field==='roles'?['unknown']:field==='using'?'false':String(changed[i][field])+' altered';
    assert.ok(validateInventory(owner,changed).length>0,`${i}:${field}`);
  }
});

test('omission, duplicate, invented and same-count replacement policies all block', () => {
  for(let i=0;i<49;i++) {
    assert.ok(validateInventory(owner,rows.filter((_,n)=>n!==i)).length>0);
    assert.ok(validateInventory(owner,[...rows,rows[i]]).length>0);
  }
  const invented=structuredClone(rows);invented[0].name='invented policy';
  assert.ok(validateInventory(owner,invented).length>0);
  assert.ok(validateInventory(owner,[...rows.slice(1),rows[1]]).length>0);
});

test('owner changes cannot be concealed behind an unchanged copied hash', () => {
  for(const replacement of ['TO "authenticated"','TO PUBLIC USING (false)']) {
    const altered=files.source.replace('TO PUBLIC WITH CHECK ((auth.uid() = user_id));',replacement+' WITH CHECK ((auth.uid() = user_id));');
    assert.ok(validateAudit({...files,source:altered}).errors.length>0);
  }
  const line=files.source.split(/\r?\n/).find(l=>l.startsWith('CREATE POLICY')&&l.includes('"public"'));
  assert.ok(validateAudit({...files,source:files.source.replace(line,'')}).errors.length>0);
  assert.ok(validateAudit({...files,source:files.source+'\n'+line.replace('Users can insert own AI calls','Extra policy')}).errors.length>0);
  assert.ok(validateAudit({...files,preflight:files.preflight.replaceAll(fingerprint(owner.policies),'00000000000000000000000000000000')}).errors.length>0);
});

test('missing candidate evidence, unjustified KEEP_PUBLIC and deferred allowlist fail closed', () => {
  const i=rows.findIndex(r=>r.classification==='NARROW_CANDIDATE');
  for(const field of ['production','authority','justification','regression','conceptual_reversal']) {
    const changed=structuredClone(rows);changed[i][field]='';
    assert.ok(validateInventory(owner,changed).length>0,field);
  }
  const anon=structuredClone(rows);anon[i].anon_dependency=true;
  assert.ok(validateInventory(owner,anon).length>0);
  const keep=structuredClone(rows);keep[i].classification='KEEP_PUBLIC';
  assert.ok(validateInventory(owner,keep).length>0);
  for(const classification of ['DECISION_REQUIRED','LEGACY_OR_DEFERRED']) {
    const changed=structuredClone(rows);const row=changed.find(r=>r.classification==='LEGACY_OR_DEFERRED');row.classification=classification;row.future_allowlist=true;
    assert.ok(validateAudit({...files,doc:replaceRows(changed)}).errors.length>0);
  }
});

test('catalog SQL uses exact comparisons, per-element text casts and unconditional false', () => {
  assert.equal(files.preflight.replace(/\r\n/g,'\n'),buildPreflight(owner,rows.map(r=>({...r,classification:r.previous_classification}))));
  assert.match(files.preflight,/SELECT role_name::text FROM pg_catalog\.unnest\(p\.roles\)/);
  assert.match(files.preflight,/SELECT \* FROM expected_policies EXCEPT SELECT \* FROM policies/);
  assert.match(files.preflight,/SELECT \* FROM policies EXCEPT SELECT \* FROM expected_policies/);
  assert.match(files.preflight,/'apt_to_apply',false/);
  assert.match(files.preflight,/WHERE NOT m.roleid=ANY\(w.visited\)/);
  assert.match(files.preflight,/effective_grant IS DISTINCT FROM expected_grant/);
  assert.match(files.preflight,/NOT bool_or\(relforcerowsecurity\)/);
  assert.match(files.preflight,/r\.rolsuper,r\.rolbypassrls,r\.rolinherit/);
  for(const [before,after] of [['role_name::text FROM','role_name FROM'],["'apt_to_apply',false","'apt_to_apply',true"],['WHERE NOT m.roleid=ANY(w.visited)',''],['count(*)=49','count(*)=48']]) {
    assert.ok(validateAudit({...files,preflight:files.preflight.replace(before,after)}).errors.length>0);
  }
});

test('DDL, DML, dynamic SQL, volatile SELECT and application reads are rejected', () => {
  for(const payload of ['ALTER POLICY x ON public.anexos TO authenticated;','DO $$ BEGIN NULL; END $$;','DELETE FROM public.anexos;','SELECT * FROM public.anexos;','SELECT pg_catalog.set_config(\'x\',\'y\',false);','SELECT pg_sleep(1);','COPY public.anexos TO STDOUT;']) {
    assert.ok(validateAudit({...files,preflight:files.preflight+'\n'+payload}).errors.length>0);
  }
  assert.ok(validateAudit({...files,preflight:files.preflight.replace('pg_catalog.pg_policies','public.anexos')}).errors.length>0);
});

test('imports perform zero I/O, environment access, requests or timers', () => {
  const validator=fs.readFileSync(path.join(root,'scripts/validate-03d3c2-b3-audit.js'),'utf8');
  const scanner=fs.readFileSync(path.join(root,'scripts/validate-03d3c1-function-hardening-sql.js'),'utf8');
  const input=`import vm from 'node:vm';
const deny=()=>{throw Error('forbidden import side effect')};
const context=vm.createContext({process:{argv:[],env:new Proxy({},{get:deny,ownKeys:deny}),stdout:{write:deny},stderr:{write:deny}},console:{log:deny},fetch:deny,setTimeout:deny,setInterval:deny});
const stubs={
 'node:fs':{default:new Proxy({},{get:deny})},
 'node:path':{default:{}},
 'node:crypto':{default:{}},
 'node:url':{fileURLToPath:deny}
};
const modules=new Map();
for(const [name,exports] of Object.entries(stubs))modules.set(name,new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v]of Object.entries(exports))this.setExport(k,v)},{context}));
const scan=new vm.SourceTextModule(${JSON.stringify(scanner)},{context,identifier:'scanner'});
const audit=new vm.SourceTextModule(${JSON.stringify(validator)},{context,identifier:'audit'});
modules.set('./validate-03d3c1-function-hardening-sql.js',scan);
modules.set('./validate-03d3c2-b0-current-sql.js',new vm.SyntheticModule(['analyzeFunctionCalls'],function(){this.setExport('analyzeFunctionCalls',()=>[])},{context}));
const linker=name=>{if(!modules.has(name))throw Error('unexpected dependency');return modules.get(name)};
await audit.link(linker);await audit.evaluate();`;
  const result=spawnSync(process.execPath,['--experimental-vm-modules','--input-type=module'],{input,encoding:'utf8',env:{}});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'');
});

test('source policy owners remain unique across versioned SQL directory', () => {
  const dir=path.join(root,'docs/test-environment');
  for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.sql')&&!['initialize_application.sql','03d3c2_b3_roles_migration.sql','03d3c2_b3_roles_rollback.sql'].includes(n))) {
    const source=fs.readFileSync(path.join(dir,name),'utf8');
    assert.doesNotMatch(source,/^\s*(?:CREATE|ALTER|DROP) POLICY\b/im,name);
  }
});

test('relative links resolve and new artifacts contain no secret patterns', () => {
  for(const match of files.doc.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const link=match[1].split('#')[0];
    if(!link||/^https?:/.test(link))continue;
    assert.ok(fs.existsSync(path.resolve(root,'docs',link)),link);
  }
  for(const name of [FILES.doc,FILES.preflight,FILES.immediate,FILES.postverify,FILES.migration,FILES.rollback,'scripts/validate-03d3c2-b3-audit.js']) {
    const content=fs.readFileSync(path.join(root,name),'utf8');
    assert.doesNotMatch(content,/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|\b(?:sk-proj-|sb_secret_)[A-Za-z0-9_-]{16,}|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/);
    assert.doesNotMatch(content,/\bPLANEA[A-Z_]*\b/);
  }
});

test('CSV remains 310 rows and 310 unique case IDs', () => {
  const csv=fs.readFileSync(path.join(root,'docs/ISOLATION_03A_MATRIX.csv'),'utf8');
  const lines=csv.trim().split(/\r?\n/);
  assert.equal(lines.length-1,310);
  assert.equal(new Set(lines.slice(1).map(l=>l.split(',')[0])).size,310);
});

test('all 49 transitions are checked, including unchanged deferred decisions', () => {
  for(let i=0;i<49;i++) {
    const changed=structuredClone(rows);
    changed[i].previous_classification='INVALID';
    assert.ok(validateInventory(owner,changed).length>0);
    changed[i]=structuredClone(rows[i]);
    changed[i].classification=rows[i].classification==='NARROW_CANDIDATE'?'DECISION_REQUIRED':'NARROW_CANDIDATE';
    assert.ok(validateInventory(owner,changed).length>0);
  }
  assert.equal(rows.filter(r=>r.previous_classification==='LEGACY_OR_DEFERRED'&&r.classification==='LEGACY_OR_DEFERRED').length,22);
  assert.ok(rows.filter(r=>['profiles','user_settings','user_profiles','ai_generation_jobs','ai_generation_calls','temas','ai_model_prices'].includes(r.table)).every(r=>!r.future_allowlist));
});

test('26 explicit role-only ALTER statements; separate symmetric rollback; no other authority', () => {
  assert.equal(files.migration.replace(/\r\n/g,'\n'),buildMutation(owner));
  assert.equal(files.rollback.replace(/\r\n/g,'\n'),buildMutation(owner,true));
  for(const [name,role] of [['migration','authenticated'],['rollback','PUBLIC']]) {
    const lines=files[name].split(/\r?\n/).filter(l=>l.startsWith('ALTER'));
    assert.equal(lines.length,26);
    const actual=lines.map(l=>{
      const m=l.match(/^ALTER POLICY "([^"]+)" ON "(public)"\."([^"]+)" TO (authenticated|PUBLIC);$/);
      assert.ok(m,l);assert.equal(m[4],role);return `${m[2]}.${m[3]}.${m[1]}`;
    });
    assert.deepEqual(actual,ALLOWLIST);
    assert.equal(new Set(actual).size,26);
    assert.equal((files[name].match(/^BEGIN;/gm)||[]).length,1);
    assert.equal((files[name].match(/^COMMIT;/gm)||[]).length,1);
    assert.doesNotMatch(files[name],/\b(?:DO|GRANT|REVOKE|CREATE|DROP|USING|CHECK|IF EXISTS)\b/);
    const extra='ALTER POLICY "profiles_select_own" ON "public"."profiles" TO authenticated;';
    assert.ok(validateAudit({...files,[name]:files[name]+extra}).errors.length>0);
    assert.ok(validateAudit({...files,[name]:files[name].replace(lines[0],'')}).errors.length>0);
  }
  assert.equal(files.rollback.replace(/TO PUBLIC;/g,'TO authenticated;'),files.migration);
});

test('after and rollback fingerprints derive from roles only; all other fields invariant', () => {
  const after=transitionPolicies(owner.policies);
  const rolled=transitionPolicies(after,'rollback');
  assert.equal(fingerprint(owner.policies),'b8f4e535ea4afa18dcb5a73c8eb3317d');
  assert.equal(fingerprint(after),'3c533f67f0e5cbeee119171f9e4a30bf');
  assert.deepEqual(rolled,owner.policies);
  assert.equal(after.filter(p=>p.roles[0]==='authenticated').length,27);
  assert.equal(after.filter(p=>p.roles[0]==='public').length,22);
  for(let i=0;i<49;i++) {
    const {roles:beforeRole,...beforeFields}=owner.policies[i];
    const {roles:afterRole,...afterFields}=after[i];
    assert.deepEqual(afterFields,beforeFields);
    const p=owner.policies[i],allowed=ALLOWLIST.includes(`${p.schema}.${p.table}.${p.name}`);
    assert.deepEqual(afterRole,allowed?['authenticated']:beforeRole);
  }
  assert.ok(files.immediate.includes(fingerprint(owner.policies)));
  assert.ok(files.postverify.includes(fingerprint(after)));
});

test('immediate/postverify are exact read-only contracts; bypass/C1/allowlist checks cannot be removed', () => {
  for(const [name,after] of [['immediate',false],['postverify',true]]) {
    assert.equal(files[name].replace(/\r\n/g,'\n'),buildRolePreflight(owner,rows,files.source,after));
    for(const predicate of IMMEDIATE_PREDICATES) assert.ok(files[name].includes(predicate),predicate);
    for(const [from,to] of [["rolbypassrls=(role_name IN ('postgres','service_role'))",'true'],['md5(p.prosrc)=e.body_md5','true'],["t.tgenabled='O'",'true'],['count(*)=26','count(*)=25']]) {
      assert.ok(files[name].includes(from));
      assert.ok(validateAudit({...files,[name]:files[name].replace(from,to)}).errors.length>0);
    }
    for(const addition of ['SELECT * FROM public.profiles;','SELECT pg_sleep(1);','DO $$ BEGIN NULL; END $$;','ALTER POLICY x ON public.anexos TO PUBLIC;']) {
      assert.ok(validateAudit({...files,[name]:files[name]+addition}).errors.length>0);
    }
  }
  assert.match(files.immediate,/'apt_to_apply',coalesce\(/);
  assert.match(files.postverify,/'postverify_ok',coalesce\(/);
  assert.match(files.postverify,/'apt_to_apply',false/);
});

function syntheticImmediate() {
  return {
    summary:{...Object.fromEntries(IMMEDIATE_PREDICATES.map(k=>[k,true])),catalog_context_matches:true,apt_to_apply:true,
      table_count:19,policy_count:49,public_policy_count:48,authenticated_policy_count:1,rls_enabled_count:19,force_rls_count:0,
      missing_or_changed:0,additional_or_changed:0,expected_full_md5:fingerprint(owner.policies),observed_full_md5:fingerprint(owner.policies)},
    allowlist:rows.filter(r=>r.future_allowlist).map(r=>({schema_name:r.schema,table_name:r.table,policy_name:r.name})),
    policies:owner.policies.map(p=>({schema_name:p.schema,table_name:p.table,policy_name:p.name,command:p.command,permissive:p.permissive,roles:p.roles,using_expr:p.using,check_expr:p.check})),
    role_attributes:['anon','authenticated','service_role','postgres'].map(role_name=>({role_name,rolbypassrls:['service_role','postgres'].includes(role_name)})),
    memberships:[]
  };
}

test('apt_to_apply interpretation fails closed for every predicate, missing field and metadata drift', () => {
  assert.equal(immediateApproval(syntheticImmediate(),owner),true);
  for(const predicate of IMMEDIATE_PREDICATES) for(const value of [false,null,undefined,'true']) {
    const r=syntheticImmediate();r.summary[predicate]=value;
    assert.equal(immediateApproval(r,owner),false,predicate);
  }
  for(const mutate of [
    r=>{r.policies[0].roles=['authenticated'];},r=>{r.policies[0].check_expr='true';},
    r=>{r.policies[0].using_expr='true';},r=>{r.policies[0].command='ALL';},
    r=>{r.policies[0].permissive='RESTRICTIVE';},r=>r.policies.pop(),
    r=>r.policies.push({...r.policies[0],policy_name:'additional'}),
    r=>{r.role_attributes[2].rolbypassrls=false;},r=>{r.role_attributes[3].rolbypassrls=false;},
    r=>{r.role_attributes[0].rolbypassrls=true;},r=>r.memberships.push({root:'anon',role:'authenticated'}),
    r=>r.allowlist.pop(),r=>r.allowlist.push({schema_name:'public',table_name:'profiles',policy_name:'profiles_select_own'}),
    r=>{r.summary.apt_to_apply=false;},r=>{r.summary.observed_full_md5='altered';}
  ]) {const result=syntheticImmediate();mutate(result);assert.equal(immediateApproval(result,owner),false);}
  assert.equal(immediateApproval(null,owner),false);
  const malformed=syntheticImmediate();malformed.policies=[null];
  assert.equal(immediateApproval(malformed,owner),false);
});

test('production B3 preflight is separate one-row read-only and PG15 exact',()=>{const sql=fs.readFileSync(path.join(root,PRODUCTION_PREFLIGHT),'utf8');assert.deepEqual(validateProductionPreflight(sql),[]);assert.equal(splitStatementsForTest(sql),1);assert.match(sql,/server_version_num'\)::integer=150008|server_version_num'\)/);assert.doesNotMatch(sql,/BETWEEN 170000|\bMAINTAIN\b|\bALTER POLICY\b/i)});
test('production B3 preflight classifies exact 26 candidates 22 deferred and one authenticated',()=>{const sql=fs.readFileSync(path.join(root,PRODUCTION_PREFLIGHT),'utf8');assert.equal(ALLOWLIST.length,26);for(const identity of ALLOWLIST){const [,table,...parts]=identity.split('.');assert.ok(sql.includes(`('public','${table}','${parts.join('.')}')`),identity)}for(const token of ["'candidate_policy_count'","'matched_candidate_policy_count'","'missing_or_changed_candidate_count'","'unexpected_candidate_count'","'legacy_or_deferred_policy_count'","'already_authenticated_policy_count'","'expected_post_b3_public_policy_count',22","'expected_post_b3_authenticated_policy_count',27"])assert.match(sql,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))});
test('production B3 preflight preserves B0 B2 defaults D3A and C1 fail-closed',()=>{const sql=fs.readFileSync(path.join(root,PRODUCTION_PREFLIGHT),'utf8');for(const token of ['post_b0_grants_exact','post_b2_sequence_exact','defaults_exact','constraints_exact','functions_exact','triggers_exact','count(*)=88','count(*)=14','count(*)=399'])assert.match(sql,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));for(const [from,to] of [["current_setting('server_version_num')::integer=150008","true"],["count(*)=88","count(*)=87"],["count(*)=14","count(*)=13"],["count(*)=26","count(*)=25"],["'apt_to_apply',(SELECT coalesce(","'removed',(SELECT coalesce("]])assert.ok(validateProductionPreflight(sql.replace(from,to)).length,from)});
test('production B3 variadic calls remain below 100 and sensitive operations are absent',()=>{const sql=fs.readFileSync(path.join(root,PRODUCTION_PREFLIGHT),'utf8'),calls=analyzeFunctionCalls(sql),clean=sql.replace(/--[^\r\n]*/g,' ').replace(/'(?:''|[^'])*'/g,"''");assert.equal(calls.every(x=>x.argumentCount<100),true);assert.doesNotMatch(clean,/last_value|setval\s*\(|nextval\s*\(|currval\s*\(|\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/i)});
function splitStatementsForTest(sql){return sql.replace(/--[^\r\n]*/g,' ').replace(/'(?:''|[^'])*'/g,"''").split(';').filter(x=>x.trim()).length}
