#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
export const FILES=Object.freeze({
 preflight:path.resolve(here,'../docs/test-environment/03d3c2_b0_current_preflight.sql'),
 migration:path.resolve(here,'../docs/test-environment/03d3c2_b0_current_migration.sql'),
 postverify:path.resolve(here,'../docs/test-environment/03d3c2_b0_current_postverify.sql'),
 diagnostic:path.resolve(here,'../docs/test-environment/03d3c2_b0_current_trigger_diagnostic.sql'),
 rollback:path.resolve(here,'../docs/test-environment/03d3c2_b0_current_rollback.sql'),
});
export const TARGET_TABLES=Object.freeze(['ai_generation_calls','ai_generation_jobs','anexos','examen_generation_items','examen_generation_jobs','examenes','grados','listas_cotejo','materias','planeacion_batches','planeaciones','planteles','profiles','temas','unidades','user_profiles','user_settings']);
export const PORTABLE=Object.freeze(['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']);
export const HARDENED_FUNCTIONS=Object.freeze([
 ['enforce_grado_ownership','f97d9b07b705d78bd7dbaf5c960c543c',false,null],['enforce_materia_ownership','b50a030da78990d83a0d3549a12092b0',false,null],
 ['enforce_planeacion_tema_ownership','0905147358485175b60fa446011e1e88',false,null],['enforce_tema_ownership','65fd6a9c4bc24803bf097347782c5cef',false,null],
 ['handle_new_user','db4596f1ea835acc5d79e921e94c803a',true,'search_path=pg_catalog, public'],['set_updated_at','204b9b9355e61b7541bc0633bbc9294c',false,null],
]);
export const HARDENED_TRIGGERS=Object.freeze([
 ['auth','users','on_auth_user_created','handle_new_user',5],['public','anexos','set_anexos_updated_at','set_updated_at',19],['public','examenes','set_examenes_updated_at','set_updated_at',19],
 ['public','grados','trg_grado_ownership','enforce_grado_ownership',23],['public','grados','trg_grados_updated_at','set_updated_at',19],['public','listas_cotejo','set_listas_cotejo_updated_at','set_updated_at',19],
 ['public','materias','trg_materia_ownership','enforce_materia_ownership',23],['public','materias','trg_materias_updated_at','set_updated_at',19],['public','planeaciones','trg_planeacion_tema_ownership','enforce_planeacion_tema_ownership',23],
 ['public','planeaciones','trg_planeaciones_updated_at','set_updated_at',19],['public','planteles','trg_planteles_updated_at','set_updated_at',19],['public','profiles','trg_profiles_updated_at','set_updated_at',19],
 ['public','temas','trg_tema_ownership','enforce_tema_ownership',23],['public','temas','trg_temas_updated_at','set_updated_at',19],['public','unidades','trg_unidades_updated_at','set_updated_at',19],['public','user_settings','trg_user_settings_updated_at','set_updated_at',19],
]);
export function evaluateHardenedContext(state){
 const functionsExact=state.functions.length===6&&HARDENED_FUNCTIONS.every(([name,hash,definer,config])=>{const rows=state.functions.filter(x=>x.name===name);return rows.length===1&&rows[0].hash===hash&&rows[0].definer===definer&&rows[0].config===config&&rows[0].owner==='postgres'&&rows[0].postgresExecute===true&&rows[0].runtimeExecute===false});
 const triggersExact=state.triggers.length===16&&HARDENED_TRIGGERS.every(([schema,table,trigger,fn,tgtype])=>{const rows=state.triggers.filter(x=>x.schema===schema&&x.table===table&&x.trigger===trigger);return rows.length===1&&rows[0].fn===fn&&rows[0].tgtype===tgtype&&rows[0].enabled===true});
 return {sixFunctionsExact:functionsExact,sixteenTriggersExact:triggersExact,triggerContextMatchesExpected:functionsExact&&triggersExact};
}

const strip=sql=>sql.replace(/--[^\r\n]*/g,' ').replace(/\/\*[\s\S]*?\*\//g,' ').replace(/'(?:''|[^'])*'/g,"''");
function statements(sql){const source=sql.replace(/--[^\r\n]*/g,' ').replace(/\/\*[\s\S]*?\*\//g,' '),out=[];let q=false,start=0;for(let i=0;i<source.length;i++){if(source[i]==="'"&&q&&source[i+1]==="'"){i++;continue}if(source[i]==="'")q=!q;if(source[i]===';'&&!q){out.push(source.slice(start,i+1).trim());start=i+1}}if(source.slice(start).trim())out.push(source.slice(start).trim());return out.filter(Boolean)}
const tableNames=statement=>[...statement.matchAll(/public\.([a-z_]+)/g)].map(x=>x[1]).filter(x=>TARGET_TABLES.includes(x));
export function simulateB0(state){const next=structuredClone(state);for(const table of TARGET_TABLES){next.tables[table].anon=[];next.tables[table].authenticated=next.tables[table].authenticated.filter(x=>!['TRUNCATE','REFERENCES','TRIGGER'].includes(x));}next.sequence.anon=[];return next}
export function simulateRollback(state){const next=structuredClone(state);for(const table of TARGET_TABLES){next.tables[table].anon=[...PORTABLE];next.tables[table].authenticated=[...new Set([...next.tables[table].authenticated,'TRUNCATE','REFERENCES','TRIGGER'])];}next.sequence.anon=['USAGE','SELECT','UPDATE'];return next}
export function validatePackage(contents=Object.fromEntries(Object.entries(FILES).map(([k,v])=>[k,fs.readFileSync(v,'utf8')]))){const errors=[];const {preflight,migration,postverify,rollback,diagnostic}=contents;
 if(statements(preflight).length!==1||statements(postverify).length!==1)errors.push('preflight/postverify must each be one read-only statement');
 if(statements(diagnostic).length!==3)errors.push('trigger diagnostic must contain three read-only statements');
 if(statements(migration).length!==5||statements(rollback).length!==5)errors.push('migration/rollback must each contain BEGIN, three ACL statements and COMMIT');
 for(const [name,sql] of [['preflight',preflight],['postverify',postverify],['diagnostic',diagnostic]])if(/\b(?:ALTER|CREATE|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|CALL|DO|COPY)\b/i.test(strip(sql)))errors.push(`${name} is not read-only`);
 for(const [name,sql] of [['migration',migration],['rollback',rollback]]){
  if(/ALL\s+PRIVILEGES/i.test(sql))errors.push(`${name} uses ALL PRIVILEGES`);
  if(/\bMAINTAIN\b/i.test(strip(sql)))errors.push(`${name} mentions MAINTAIN`);
  if(/\b(?:DO|EXECUTE|ALTER|CREATE|DROP|CALL|COPY)\b/i.test(strip(sql)))errors.push(`${name} contains out-of-scope command`);
  if(/ai_model_prices|ia_metrics_legacy/i.test(sql))errors.push(`${name} includes excluded table`);
 }
 const migrationStatements=statements(migration),rollbackStatements=statements(rollback);
 for(const index of [1,2]){const found=[...new Set(tableNames(migrationStatements[index]))].sort();if(JSON.stringify(found)!==JSON.stringify([...TARGET_TABLES].sort()))errors.push(`migration table manifest mismatch at ${index}`);}
 for(const index of [1,2]){const found=[...new Set(tableNames(rollbackStatements[index]))].sort();if(JSON.stringify(found)!==JSON.stringify([...TARGET_TABLES].sort()))errors.push(`rollback table manifest mismatch at ${index}`);}
 if(!/REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*FROM anon;/i.test(migration))errors.push('anon table revoke mismatch');
 if(!/REVOKE TRUNCATE, REFERENCES, TRIGGER[\s\S]*FROM authenticated;/i.test(migration))errors.push('authenticated revoke mismatch');
 if(!/REVOKE USAGE, SELECT, UPDATE ON SEQUENCE public\.planeaciones_id_seq FROM anon;/i.test(migration))errors.push('sequence revoke mismatch');
 if(!/GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER[\s\S]*TO anon;/i.test(rollback))errors.push('anon rollback mismatch');
 if(!/GRANT TRUNCATE, REFERENCES, TRIGGER[\s\S]*TO authenticated;/i.test(rollback))errors.push('authenticated rollback mismatch');
 if(!/GRANT USAGE, SELECT, UPDATE ON SEQUENCE public\.planeaciones_id_seq TO anon;/i.test(rollback))errors.push('sequence rollback mismatch');
 for(const token of ['apt_to_apply','defaults_context_ok','maintain_absent_ok','policies_ok','sequence_ok','technical_roles_ok','membership_paths'])if(!preflight.includes(token))errors.push(`preflight missing ${token}`);
 for(const token of ['anon_zero_on_all_tables','authenticated_exact','service_role_unchanged','postgres_unchanged','defaults_unchanged','policies_unchanged','maintain_absent','six_functions_exact','sixteen_triggers_exact','trigger_context_matches_expected'])if(!postverify.includes(token))errors.push(`postverify missing ${token}`);
 const c1=fs.readFileSync(path.resolve(here,'../docs/test-environment/03d3c1_function_hardening_postverify.sql'),'utf8');
 const hashes=[...c1.matchAll(/\('([a-z_]+)', '([0-9a-f]{32})', (?:true|false),/g)].map(m=>`${m[1]}:${m[2]}`);
 for(const entry of hashes){const [name,hash]=entry.split(':');if(!postverify.includes(`('${name}', '${hash}'`)||!diagnostic.includes(`('${name}', '${hash}'`))errors.push(`03D3C1 function fingerprint mismatch: ${name}`)}
 const triggers=[...c1.matchAll(/\('(?:auth|public)','[a-z_]+'\s*,'([a-z_]+)','([a-z_]+)',(?:5|19|23)\)/g)].map(m=>`${m[1]}:${m[2]}`);
 for(const entry of triggers){const [trigger,fn]=entry.split(':');if(!postverify.includes(`'${trigger}','${fn}'`)||!diagnostic.includes(`'${trigger}','${fn}'`))errors.push(`03D3C1 trigger manifest mismatch: ${trigger}`)}
 if(hashes.length!==6||triggers.length!==16)errors.push('03D3C1 source manifest is not 6 functions / 16 triggers');
 for(const [schema,table,trigger,fn,tgtype] of HARDENED_TRIGGERS){const tuple=`('${schema}','${table}','${trigger}','${fn}',${tgtype})`;if(!postverify.includes(tuple)||!diagnostic.includes(tuple))errors.push(`exact trigger tuple mismatch: ${schema}.${table}.${trigger}`)}
 for(const sql of [postverify,diagnostic]){
  if(/n\.nspname='public'[\s\S]{0,160}NOT t\.tgisinternal\)\s*=\s*16/i.test(sql))errors.push('historical public-only trigger count reintroduced');
  if(!/search_path=pg_catalog, public/.test(sql))errors.push('hardened handle_new_user search_path missing');
  if(!/has_function_privilege\('postgres',[\s\S]*'EXECUTE'\)/.test(sql))errors.push('postgres execute check missing');
  for(const role of ['anon','authenticated','service_role'])if(!new RegExp(`NOT pg_catalog\\.has_function_privilege\\('${role}',[\\s\\S]*?'EXECUTE'\\)`).test(sql))errors.push(`${role} execute revocation check missing`);
 }
 for(const token of ['function_name','object_count','overload_count','owner_matches','body_hash_matches','security_matches','config_matches','execute_acl_matches','schema_name','table_name','trigger_name','function_name','enabled_matches','event_matches','binding_matches','six_functions_exact','sixteen_triggers_exact','trigger_context_matches_expected'])if(!diagnostic.includes(token))errors.push(`diagnostic missing ${token}`);
 if(/pg_get_functiondef|\bp\.prosrc\s+AS\b/i.test(strip(diagnostic)))errors.push('diagnostic exposes function bodies');
 return {errors,statementCounts:{preflight:statements(preflight).length,migration:statements(migration).length,postverify:statements(postverify).length,rollback:statements(rollback).length}}}
function main(){const r=validatePackage();if(r.errors.length){for(const e of r.errors)process.stderr.write(`ERROR ${e}\n`);process.exitCode=1}else process.stdout.write(`PASS targets=${TARGET_TABLES.length} statements=1/5/1/5\n`)}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
