#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
export const FILES=Object.freeze({
 preflight:path.resolve(here,'../docs/test-environment/03d3c2_b0_current_preflight.sql'),
 migration:path.resolve(here,'../docs/test-environment/03d3c2_b0_current_migration.sql'),
 postverify:path.resolve(here,'../docs/test-environment/03d3c2_b0_current_postverify.sql'),
 diagnostic:path.resolve(here,'../docs/test-environment/03d3c2_b0_current_trigger_diagnostic.sql'),
 rollback:path.resolve(here,'../docs/test-environment/03d3c2_b0_current_rollback.sql'),
});
export const PRODUCTION_PREFLIGHT=path.resolve(here,'../docs/production/03d3c2_b0_current_prod_preflight.sql');
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
export const PRODUCTION_OUTPUT_KEYS=Object.freeze([
 'expected_project_name','expected_project_ref','expected_region','project_ref_verified_by_sql','visual_project_ref_confirmation_required',
 'catalog_check_does_not_verify_project_ref','current_user','session_user','server_version_num','server_context_matches','authority_context_matches',
 'public_table_count','b0_target_table_count','b0_target_tables','table_context','expected_table_grant_count','matched_table_grant_count',
 'unexpected_table_grant_count','public_table_grant_count','inherited_or_public_effect_count','runtime_membership_count','table_grants',
 'policy_count','public_policy_count','authenticated_price_policy_count','policy_manifest_md5','policy_definition_md5','policies',
 'sequence_count','matched_sequence_object_count','matched_sequence_grant_count','unexpected_sequence_grant_count','public_sequence_grant_count',
 'sequence_context','sequence_grants','default_privilege_count','matched_default_privilege_count','postgres_default_privilege_count',
 'supabase_admin_default_privilege_count','function_default_privilege_count','table_default_privilege_count','sequence_default_privilege_count',
 'unexpected_default_privilege_count','default_privileges','expected_03d3a_constraint_count','matched_03d3a_constraint_count',
 'changed_03d3a_constraint_count','unexpected_03d3a_constraint_count','expected_c1_function_count','matched_c1_function_count',
 'relevant_c1_function_count','expected_c1_trigger_count','matched_c1_trigger_count','relevant_c1_trigger_count','catalog_context_matches','apt_to_apply'
]);
function maskNonCode(sql){
 const chars=[...sql];let i=0,state='code',depth=0;
 while(i<chars.length){const c=chars[i],n=chars[i+1];
  if(state==='line'){if(c==='\n'){state='code'}else chars[i]=' ';i++;continue}
  if(state==='block'){chars[i]=' ';if(c==='/'&&n==='*'){chars[i+1]=' ';depth++;i+=2;continue}if(c==='*'&&n==='/'){chars[i+1]=' ';depth--;i+=2;if(!depth)state='code';continue}i++;continue}
  if(state==='single'){chars[i]=' ';if(c==="'"&&n==="'"){chars[i+1]=' ';i+=2;continue}if(c==="'")state='code';i++;continue}
  if(state==='double'){chars[i]=' ';if(c==='"'&&n==='"'){chars[i+1]=' ';i+=2;continue}if(c==='"')state='code';i++;continue}
  if(c==='-'&&n==='-'){chars[i]=chars[i+1]=' ';state='line';i+=2;continue}
  if(c==='/'&&n==='*'){chars[i]=chars[i+1]=' ';state='block';depth=1;i+=2;continue}
  if(c==="'"){chars[i]=' ';state='single';i++;continue}if(c==='"'){chars[i]=' ';state='double';i++;continue}i++;
 }
 if(!['code','line'].includes(state))throw new Error(`unterminated SQL ${state}`);return chars.join('');
}
export function analyzeFunctionCalls(sql,names=['jsonb_build_object','json_build_object','jsonb_build_array','json_build_array','format']){
 const masked=maskNonCode(sql),pattern=new RegExp(`\\b(${names.join('|')})\\s*\\(`,'gi'),calls=[];let match;
 while((match=pattern.exec(masked))){const open=masked.indexOf('(',match.index),parts=[];let start=open+1,paren=1,bracket=0,i=open+1;
  for(;i<masked.length&&paren;i++){const c=masked[i];if(c==='(')paren++;else if(c===')')paren--;else if(c==='[')bracket++;else if(c===']')bracket--;else if(c===','&&paren===1&&bracket===0){parts.push(sql.slice(start,i).trim());start=i+1}}
  if(paren)throw new Error(`unterminated ${match[1]} call`);const tail=sql.slice(start,i-1).trim();if(tail||parts.length)parts.push(tail);
  calls.push(Object.freeze({name:match[1].toLowerCase(),start:match.index,end:i,argumentCount:parts.length,arguments:Object.freeze(parts)}));
 }
 return Object.freeze(calls);
}
export function productionOutputKeys(sql){
 const start=sql.lastIndexOf('SELECT jsonb_build_object('),suffix=sql.slice(start);
 const calls=analyzeFunctionCalls(suffix,['jsonb_build_object']);
 const outer=calls.filter(call=>!calls.some(parent=>parent!==call&&parent.start<call.start&&parent.end>call.end));
 return Object.freeze(outer.flatMap(call=>call.arguments.filter((_,index)=>index%2===0).map(value=>value.match(/^'([^']+)'$/)?.[1]).filter(Boolean)));
}
export function derivePolicyDefinitionHash(source){
 const pattern=/CREATE POLICY "([^"]+)" ON "public"\."([^"]+)" AS PERMISSIVE FOR (ALL|SELECT|INSERT|UPDATE|DELETE) TO (PUBLIC|"authenticated")(?: USING \((.*?)\))?(?: WITH CHECK \((.*?)\))?;/gs;
 const rows=[...source.matchAll(pattern)].map(m=>[m[2],m[1],m[3],m[4].replaceAll('"','').toLowerCase(),m[5]??'<null>',m[6]??'<null>'].join('|')).sort();
 if(rows.length!==49)throw new Error(`expected 49 versioned policies, found ${rows.length}`);
 return crypto.createHash('md5').update(rows.join('\n')).digest('hex');
}
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
export function validateProductionPreflight(sql=fs.readFileSync(PRODUCTION_PREFLIGHT,'utf8'),source=fs.readFileSync(path.resolve(here,'../docs/test-environment/initialize_application.sql'),'utf8')){
 const errors=[];const clean=strip(sql);const parsed=statements(sql);
 if(parsed.length!==1||!/^WITH RECURSIVE\b/i.test(parsed[0])||!/AS production_preflight_result/.test(sql))errors.push('production preflight must be one structured WITH statement');
 if(/\b(?:ALTER|CREATE|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|CALL|DO|COPY|LOCK|BEGIN|COMMIT|ROLLBACK|set_config|pg_sleep|dblink|http_|net\.)\b/i.test(clean))errors.push('production preflight is not strictly read-only');
 if(!/preflight productivo estrictamente READ-ONLY/i.test(sql)||/PostgreSQL test 17\.x only|Supabase test only/i.test(sql))errors.push('production classification mismatch');
 for(const [token,value] of [['expected_project_name','educativo-backend'],['expected_project_ref','bfnkaqmhcsyxdxoqnahk'],['expected_region','us-east-2']])if(!sql.includes(`'${token}','${value}'`))errors.push(`production identity missing ${token}`);
 for(const token of ["'project_ref_verified_by_sql',false","'visual_project_ref_confirmation_required',true","'catalog_check_does_not_verify_project_ref',true"])if(!sql.includes(token))errors.push(`human project boundary missing ${token}`);
 if((sql.match(/\('[a-z_]+',(true|false)\)/g)||[]).length!==19)errors.push('production preflight requires exact 19-table manifest');
 for(const table of TARGET_TABLES)if(!sql.includes(`('${table}',true)`))errors.push(`production target missing ${table}`);
 for(const table of ['ai_model_prices','ia_metrics_legacy'])if(!sql.includes(`('${table}',false)`))errors.push(`production excluded table missing ${table}`);
 for(const token of ['owner_name','relrowsecurity','relforcerowsecurity','direct_privileges','effective_privileges','inherited_or_public_effect_count','runtime_membership_count'])if(!sql.includes(token))errors.push(`table/role context missing ${token}`);
 for(const role of ['anon','authenticated','service_role','postgres'])if(!sql.includes(`('${role}')`))errors.push(`role manifest missing ${role}`);
 if(!/expected_table_grant_count=505 AND matched_table_grant_count=505 AND unexpected_table_grant_count=0 AND public_table_grant_count=0/.test(sql))errors.push('exact pre-B0 grant baseline missing');
 let policyDefinitionHash;try{policyDefinitionHash=derivePolicyDefinitionHash(source)}catch(error){errors.push(error.message)}
 if(!/policy_count=49 AND public_policy_count=48 AND authenticated_price_policy_count=1/.test(sql)||!sql.includes("policy_manifest_md5='221d334d3db5913257ac610efba163a9'")||!policyDefinitionHash||!sql.includes(`policy_definition_md5='${policyDefinitionHash}'`)||!sql.includes("'using_expression'")||!sql.includes("'with_check_expression'"))errors.push('policy baseline missing');
 if(!/sequence_count=1 AND matched_sequence_object_count=1 AND matched_sequence_grant_count=12 AND unexpected_sequence_grant_count=0 AND public_sequence_grant_count=0/.test(sql)||!sql.includes('planeaciones_id_seq'))errors.push('sequence baseline missing');
 if(!/default_privilege_count=88 AND matched_default_privilege_count=88/.test(sql)||!sql.includes('postgres_default_privilege_count=44')||!sql.includes('supabase_admin_default_privilege_count=44')||!sql.includes('table_default_privilege_count=56'))errors.push('PG15 default privilege baseline missing');
 if(/\bMAINTAIN\b/i.test(clean)||/\b(?:NULLS\s+NOT\s+DISTINCT|PERIOD|ENFORCED)\b/i.test(clean))errors.push('syntax or privileges outside PostgreSQL 15 contract');
 if((sql.match(/\('educativo_ia_/g)||[]).length!==14||!/matched_03d3a_constraint_count=14 AND changed_03d3a_constraint_count=0 AND unexpected_03d3a_constraint_count=0/.test(sql))errors.push('03D3A baseline missing');
 for(const [name,hash] of HARDENED_FUNCTIONS)if(!sql.includes(`('${name}','${hash}'`))errors.push(`C1 function baseline missing ${name}`);
 for(const [schema,table,trigger,fn,tgtype] of HARDENED_TRIGGERS)if(!sql.includes(`('${schema}','${table}','${trigger}','${fn}',${tgtype})`))errors.push(`C1 trigger baseline missing ${trigger}`);
 if(!/matched_function_count=6 AND relevant_function_count=6 AND matched_trigger_count=16 AND relevant_trigger_count=16/.test(sql))errors.push('C1 fail-closed counts missing');
 if(!/current_setting\('server_version_num'\)::integer=150008/.test(sql)||!/current_user='postgres' AND session_user='postgres'/.test(sql))errors.push('PG15.8/authority gate missing');
 if(!/'apt_to_apply',catalog_context_matches AND server_context_matches AND authority_context_matches/.test(sql))errors.push('fail-closed apt_to_apply missing');
 let calls=[];try{calls=analyzeFunctionCalls(sql)}catch(error){errors.push(error.message)}
 for(const call of calls)if(call.argumentCount>=100)errors.push(`${call.name} has ${call.argumentCount} arguments; must stay below 100`);
 let outputKeys=[];try{outputKeys=productionOutputKeys(sql)}catch(error){errors.push(error.message)}
 if(JSON.stringify(outputKeys)!==JSON.stringify(PRODUCTION_OUTPUT_KEYS))errors.push('production output key contract changed');
 if(/pg_get_functiondef|\bp\.prosrc\s+AS\b/i.test(clean)||/\b(?:email|full_name|password|authorization|contenido|tabla_ia)\b/i.test(clean))errors.push('sensitive or raw body output forbidden');
 return errors;
}
function main(){const r=validatePackage(),errors=[...r.errors,...validateProductionPreflight()];if(errors.length){for(const e of errors)process.stderr.write(`ERROR ${e}\n`);process.exitCode=1}else process.stdout.write(`PASS targets=${TARGET_TABLES.length} statements=1/5/1/5 production=1\n`)}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
