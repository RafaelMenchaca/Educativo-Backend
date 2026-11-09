import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {FILES,FUNCTIONS,PRODUCTION_PREFLIGHT,TRIGGERS,extractCallBodies,extractDollarQuotedFunctionBody,fingerprintBodyCandidates,fingerprintVersionedFunctionBodies,loadPackage,loadProductionPreflight,loadVersionedFunctionSource,scanSql,splitSqlStatements,toTestProsrcRepresentation,validateFunctionHardeningPackage,validateProductionFunctionPreflight} from '../../scripts/validate-03d3c1-function-hardening-sql.js';

const pkg=loadPackage();
const sourceSql=loadVersionedFunctionSource();
const productionPreflight=loadProductionPreflight();
const validate=files=>validateFunctionHardeningPackage(files,sourceSql);
const invalid=(key,fn)=>({...pkg,[key]:fn(pkg[key])});
const rejects=(key,fn)=>assert.notDeepEqual(validate(invalid(key,fn)),[]);

test('four-file package validates offline',()=>assert.deepEqual(validate(pkg),[]));
test('manifest is exact and immutable',()=>{assert.deepEqual(Object.keys(FILES),['preflight','migration','postverify','rollback']);assert.equal(FUNCTIONS.length,6);assert.equal(new Set(FUNCTIONS).size,6);assert.equal(TRIGGERS.length,16);assert.equal(new Set(TRIGGERS).size,16)});
test('statement counts are exact',()=>assert.deepEqual(Object.fromEntries(Object.entries(pkg).map(([k,s])=>[k,splitSqlStatements(s).length])),{preflight:4,migration:9,postverify:3,rollback:9}));
test('scanner handles nested comments, strings, tagged and untagged dollar quotes',()=>{const s="SELECT 1; /* outer DELETE; /* inner DROP; */ */ SELECT 'ALTER'; SELECT $x$CREATE;$x$; SELECT $$GRANT;$$;";assert.equal(splitSqlStatements(s).length,4);assert.doesNotMatch(scanSql(s),/DELETE|DROP|ALTER|CREATE|GRANT/)});
test('preflight and postverify are read-only',()=>{assert.doesNotMatch(scanSql(pkg.preflight),/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/i);assert.doesNotMatch(scanSql(pkg.postverify),/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE)\b/i)});
test('migration changes only handle search_path and six execute ACLs',()=>{assert.match(pkg.migration,/ALTER FUNCTION public\.handle_new_user\(\) SET search_path = pg_catalog, public/);assert.equal((pkg.migration.match(/REVOKE EXECUTE ON FUNCTION/g)||[]).length,6)});
test('rollback is the limited effective inverse',()=>{assert.match(pkg.rollback,/RESET search_path/);assert.equal((pkg.rollback.match(/GRANT EXECUTE ON FUNCTION/g)||[]).length,6);assert.match(pkg.rollback,/cannot promise byte-for-byte proacl/)});
test('exact six signatures reject an overload with arguments',()=>rejects('migration',s=>s.replace('public.handle_new_user()','public.handle_new_user(text)')));
test('missing function is rejected',()=>rejects('migration',s=>s.replace(/REVOKE EXECUTE ON FUNCTION public\.set_updated_at\(\)[^;]+;\s*/,' ')));
test('additional function is rejected',()=>rejects('migration',s=>s.replace('COMMIT;','REVOKE EXECUTE ON FUNCTION public.extra() FROM PUBLIC, anon, authenticated, service_role;\nCOMMIT;')));
test('owner change is rejected',()=>rejects('migration',s=>s.replace('COMMIT;','ALTER FUNCTION public.handle_new_user() OWNER TO service_role;\nCOMMIT;')));
test('security mode change is rejected',()=>rejects('migration',s=>s.replace('COMMIT;','ALTER FUNCTION public.set_updated_at() SECURITY DEFINER;\nCOMMIT;')));
test('function body change and CREATE OR REPLACE are rejected',()=>rejects('migration',s=>s.replace('COMMIT;','CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;\nCOMMIT;')));
test('unsafe search paths are rejected',()=>{for(const value of ['public, pg_catalog','pg_catalog, public, pg_temp','pg_catalog, "$user"'])rejects('migration',s=>s.replace('pg_catalog, public',value))});
test('accidental grants to runtime roles are rejected',()=>rejects('migration',s=>s.replace('REVOKE EXECUTE','GRANT EXECUTE')));
test('revocation outside the allowlist is rejected',()=>rejects('migration',s=>s.replace('COMMIT;','REVOKE EXECUTE ON FUNCTION public.extra() FROM PUBLIC;\nCOMMIT;')));
test('trigger alteration is rejected',()=>rejects('migration',s=>s.replace('COMMIT;','ALTER TRIGGER trg_profiles_updated_at ON public.profiles DISABLE;\nCOMMIT;')));
test('dynamic SQL is rejected',()=>rejects('migration',s=>s.replace('COMMIT;','DO $$BEGIN EXECUTE format(\'REVOKE %s\',\'x\'); END$$;\nCOMMIT;')));
test('rollback incomplete is rejected',()=>rejects('rollback',s=>s.replace(/GRANT EXECUTE ON FUNCTION public\.set_updated_at\(\)[^;]+;\s*/,' ')));
test('false byte-for-byte ACL restoration claim is rejected',()=>rejects('rollback',s=>s.replace('cannot promise byte-for-byte proacl ordering/grantor identity','restores exact proacl')));
test('schema public writability is an explicit blocking check',()=>{assert.match(pkg.preflight,/public_has_create/);assert.match(pkg.preflight,/anon_has_create/);assert.match(pkg.preflight,/authenticated_has_create/);assert.match(pkg.preflight,/apt_to_apply/)});
test('catalog-name arrays cast each element to text before aggregation',()=>{
 const calls=extractCallBodies(pkg.preflight+pkg.postverify,'array_agg');
 assert.equal(calls.length,1);
 assert.match(calls[0],/^\s*DISTINCT\b/i);
 assert.match(calls[0].split(/\bORDER\s+BY\b/i)[0].trim(),/\)::text$/i);
 assert.match(calls[0],/\bORDER\s+BY\b[\s\S]*\)::text\s*$/i);
});
test('the live name-array regression and equivalent uncast variants are rejected',()=>{
 rejects('preflight',s=>s.replaceAll(' END)::text',' END)'));
 rejects('preflight',s=>s.replace(/\(CASE WHEN x\.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog\.pg_get_userbyid\(x\.grantee\) END\)::text/g,"pg_catalog.pg_get_userbyid(x.grantee)"));
});
test('ACL grantees remain exactly five canonical values in deterministic deduplicated order',()=>{
 assert.match(pkg.preflight,/array_agg\s*\(\s*DISTINCT[\s\S]*ORDER\s+BY/i);
 assert.match(pkg.preflight,/acl\.execute_grantees\s*=\s*ARRAY\['PUBLIC','anon','authenticated','postgres','service_role'\]::text\[\]/);
 rejects('preflight',s=>s.replace("'service_role']::text[]","'service_role','supabase_auth_admin']::text[]"));
 rejects('preflight',s=>s.replace('array_agg(DISTINCT','array_agg('));
 rejects('preflight',s=>s.replace(/\s+ORDER BY \(CASE WHEN x\.grantee[\s\S]*?END\)::text\)/,'\n'));
});
test('dollar-quoted extractor preserves tagged and untagged bodies exactly',()=>{
 const tagged="CREATE FUNCTION public.tagged() RETURNS trigger LANGUAGE plpgsql AS $body$\nBEGIN\n  -- keep comment\n  RETURN 'x';\nEND;\n$body$;";
 const plain="CREATE FUNCTION public.plain() RETURNS trigger LANGUAGE plpgsql AS $$\r\nBEGIN\r\n  RETURN NEW;\r\nEND;\r\n$$;";
 assert.deepEqual(extractDollarQuotedFunctionBody(tagged,'tagged'),{delimiter:'$body$',body:"\nBEGIN\n  -- keep comment\n  RETURN 'x';\nEND;\n"});
 assert.deepEqual(extractDollarQuotedFunctionBody(plain,'plain'),{delimiter:'$$',body:"\r\nBEGIN\r\n  RETURN NEW;\r\nEND;\r\n"});
});
test('fingerprint representation changes only line endings and preserves outer newlines and interior text',()=>{
 const body="\nBEGIN\n  --  two spaces stay\n  RETURN 'A  B';\nEND;\n";
 const represented=toTestProsrcRepresentation(body);
 assert.equal(represented,"\r\nBEGIN\r\n  --  two spaces stay\r\n  RETURN 'A  B';\r\nEND;\r\n");
 assert.ok(represented.startsWith('\r\n'));assert.ok(represented.endsWith('\r\n'));
 assert.equal(toTestProsrcRepresentation(represented),represented);
});
test('all six fingerprints are deterministically derived from versioned SQL',()=>{
 const hashes=fingerprintVersionedFunctionBodies(sourceSql);
 assert.deepEqual(hashes,{
  handle_new_user:'db4596f1ea835acc5d79e921e94c803a',set_updated_at:'204b9b9355e61b7541bc0633bbc9294c',
  enforce_grado_ownership:'f97d9b07b705d78bd7dbaf5c960c543c',enforce_materia_ownership:'b50a030da78990d83a0d3549a12092b0',
  enforce_tema_ownership:'65fd6a9c4bc24803bf097347782c5cef',enforce_planeacion_tema_ownership:'0905147358485175b60fa446011e1e88'
 });
 for(const [name,hash] of Object.entries(hashes)){
  assert.match(pkg.preflight,new RegExp(`'${name}', '${hash}'`));
  assert.match(pkg.postverify,new RegExp(`'${name}', '${hash}'`));
 }
});
test('one LF rule explains old hashes and one CRLF rule explains all live hashes',()=>{
 const old={enforce_grado_ownership:'dc407b2dbc927916b368e2b02acba144',enforce_materia_ownership:'44b09477000b2ee89c8e3b97a8aab620',enforce_planeacion_tema_ownership:'d014080b06560a18c188016a791a9366',enforce_tema_ownership:'06f919d570088e3f3153e48be9f9eafe',handle_new_user:'58697aab06b589875e96c5b4333bb8c5',set_updated_at:'9b1889f56258bf9d6554213c05019c76'};
 const live=fingerprintVersionedFunctionBodies(sourceSql);
 for(const name of FUNCTIONS){
  const candidates=fingerprintBodyCandidates(extractDollarQuotedFunctionBody(sourceSql,name).body);
  assert.equal(candidates.lf,old[name]);assert.equal(candidates.crlf,live[name]);
  for(const variant of ['lf-drop-first','lf-drop-last','lf-drop-both','lf-trim','crlf-drop-first','crlf-drop-last','crlf-drop-both','crlf-trim'])assert.notEqual(candidates[variant],live[name]);
 }
});
test('LF and CRLF sources derive the same test prosrc fingerprints',()=>{
 const lf=sourceSql.replace(/\r\n|\r/g,'\n');
 const crlf=lf.replace(/\n/g,'\r\n');
 assert.deepEqual(fingerprintVersionedFunctionBodies(lf),fingerprintVersionedFunctionBodies(crlf));
});
test('altered body changes its derived fingerprint and constants cannot pass without derivation',()=>{
 const changed=sourceSql.replace('new.updated_at = now();','new.updated_at  = now();');
 const original=fingerprintVersionedFunctionBodies(sourceSql),altered=fingerprintVersionedFunctionBodies(changed);
 assert.notEqual(altered.set_updated_at,original.set_updated_at);
 assert.notDeepEqual(validateFunctionHardeningPackage(pkg,changed),[]);
 rejects('preflight',s=>s.replace(original.set_updated_at,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
});
test('preflight exposes every body predicate and sanitized hashes without raw bodies',()=>{
 for(const field of ['security_matches','kind_matches','signature_matches','expected_body_md5','observed_body_md5','body_hash_matches'])assert.match(pkg.preflight,new RegExp(`\\b${field}\\b`));
 assert.doesNotMatch(pkg.preflight,/pg_get_functiondef/i);
 assert.doesNotMatch(pkg.preflight,/SELECT[^;]*\bp\.prosrc\s*(?:,|\bAS\b)/i);
});
test('body text is never returned',()=>{assert.doesNotMatch(pkg.preflight+pkg.postverify,/pg_get_functiondef/i);assert.match(pkg.preflight,/md5\(p\.prosrc\)/);assert.match(pkg.postverify,/md5\(p\.prosrc\)/)});
test('all trigger consumers are structurally verified',()=>{for(const name of TRIGGERS){assert.match(pkg.preflight,new RegExp(name));assert.match(pkg.postverify,new RegExp(name))}});
test('comment string and dollar-quote attacks do not satisfy allowlisted commands',()=>{rejects('migration',s=>s.replace('ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public;','-- ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public;'));rejects('migration',s=>s.replace('REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;',"SELECT 'REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role';"))});
test('module import performs no I/O beyond explicit load calls',async()=>{const mod=await import('../../scripts/validate-03d3c1-function-hardening-sql.js?noio=1');assert.equal(typeof mod.validateFunctionHardeningPackage,'function')});
test('production preflight is separate and validates offline',()=>{assert.equal(PRODUCTION_PREFLIGHT,'docs/production/03d3c1_function_hardening_prod_preflight.sql');assert.deepEqual(validateProductionFunctionPreflight(productionPreflight,sourceSql),[]);assert.match(pkg.preflight,/Do not execute in production/)});
test('production preflight is one structured read-only statement',()=>{assert.equal(splitSqlStatements(productionPreflight).length,1);assert.match(productionPreflight,/AS production_preflight_result/);assert.doesNotMatch(scanSql(productionPreflight),/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|LOCK|BEGIN|COMMIT)\b/i)});
test('production identity remains a human expectation',()=>{assert.match(productionPreflight,/educativo-backend/);assert.match(productionPreflight,/bfnkaqmhcsyxdxoqnahk/);assert.match(productionPreflight,/'project_ref_verified_by_sql',false/);assert.match(productionPreflight,/'visual_project_ref_confirmation_required',true/)});
test('production baseline contains exact six functions and sixteen triggers',()=>{for(const name of FUNCTIONS)assert.match(productionPreflight,new RegExp(name));for(const name of TRIGGERS)assert.match(productionPreflight,new RegExp(name));assert.match(productionPreflight,/function_count=6 AND matched_function_count=6/);assert.match(productionPreflight,/trigger_count=16 AND matched_trigger_count=16/);assert.match(productionPreflight,/unexpected_trigger_count=0/)});
test('production fingerprints derive from versioned bodies',()=>{const hashes=fingerprintVersionedFunctionBodies(sourceSql);for(const [name,hash] of Object.entries(hashes))assert.match(productionPreflight,new RegExp(`'${name}','${hash}'`))});
test('production baseline requires completed 03D3A',()=>{assert.equal((productionPreflight.match(/^ \('educativo_ia_/gm)||[]).length,14);assert.match(productionPreflight,/matched_03d3a_constraint_count=14/);assert.match(productionPreflight,/changed_03d3a_constraint_count=0/);assert.match(productionPreflight,/unexpected_03d3a_constraint_count=0/)});
test('production decision is fail closed for PG15 authority and catalog',()=>{assert.match(productionPreflight,/server_version_num'\)::integer=150008/);assert.match(productionPreflight,/current_user='postgres' AND session_user='postgres'/);assert.match(productionPreflight,/'apt_to_apply',catalog_context_matches AND server_context_matches AND authority_context_matches/)});
test('production output contains hashes but no bodies or sensitive row data',()=>{assert.doesNotMatch(productionPreflight,/pg_get_functiondef/);assert.doesNotMatch(productionPreflight,/email|full_name|token|password|authorization|contenido|tabla_ia/i)});
test('production validator rejects mutation, false project verification and missing trigger',()=>{assert.ok(validateProductionFunctionPreflight(productionPreflight+'\nDELETE FROM public.profiles;',sourceSql).length);assert.ok(validateProductionFunctionPreflight(productionPreflight.replace("'project_ref_verified_by_sql',false","'project_ref_verified_by_sql',true"),sourceSql).length);assert.ok(validateProductionFunctionPreflight(productionPreflight.replace("('public','profiles','trg_profiles_updated_at'","('public','profiles','missing_trigger'"),sourceSql).length)});
