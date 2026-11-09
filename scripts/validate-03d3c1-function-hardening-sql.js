import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const FILES=Object.freeze({
 preflight:'docs/test-environment/03d3c1_function_hardening_preflight.sql',
 migration:'docs/test-environment/03d3c1_function_hardening_migration.sql',
 postverify:'docs/test-environment/03d3c1_function_hardening_postverify.sql',
 rollback:'docs/test-environment/03d3c1_function_hardening_rollback.sql'
});
export const PRODUCTION_PREFLIGHT='docs/production/03d3c1_function_hardening_prod_preflight.sql';
export const PRODUCTION_FILES=Object.freeze({
 migration:'docs/production/03d3c1_function_hardening_prod_migration.sql',
 postverify:'docs/production/03d3c1_function_hardening_prod_postverify.sql',
 rollback:'docs/production/03d3c1_function_hardening_prod_rollback.sql'
});
export const FUNCTIONS=Object.freeze([
 'handle_new_user','set_updated_at','enforce_grado_ownership','enforce_materia_ownership',
 'enforce_tema_ownership','enforce_planeacion_tema_ownership'
]);
export const TRIGGERS=Object.freeze([
 'on_auth_user_created','set_anexos_updated_at','set_examenes_updated_at','trg_grado_ownership',
 'trg_grados_updated_at','set_listas_cotejo_updated_at','trg_materia_ownership','trg_materias_updated_at',
 'trg_planeacion_tema_ownership','trg_planeaciones_updated_at','trg_planteles_updated_at',
 'trg_profiles_updated_at','trg_tema_ownership','trg_temas_updated_at','trg_unidades_updated_at',
 'trg_user_settings_updated_at'
]);
export const FUNCTION_SOURCE='docs/test-environment/initialize_application.sql';

export function splitSqlStatements(sql){
 const out=[];let cur='',i=0,state='code',depth=0,tag='';
 while(i<sql.length){const c=sql[i],n=sql[i+1];
  if(state==='line'){if(c==='\n'){state='code';cur+='\n'}i++;continue}
  if(state==='block'){if(c==='/'&&n==='*'){depth++;i+=2;continue}if(c==='*'&&n==='/'){if(--depth===0)state='code';i+=2;continue}i++;continue}
  if(state==='single'){cur+=c;if(c==="'"&&n==="'"){cur+=n;i+=2;continue}if(c==="'")state='code';i++;continue}
  if(state==='double'){cur+=c;if(c==='"'&&n==='"'){cur+=n;i+=2;continue}if(c==='"')state='code';i++;continue}
  if(state==='dollar'){if(sql.startsWith(tag,i)){cur+=tag;i+=tag.length;state='code'}else{cur+=c;i++}continue}
  if(c==='-'&&n==='-'){state='line';i+=2;continue}if(c==='/'&&n==='*'){state='block';depth=1;i+=2;continue}
  if(c==="'"){state='single';cur+=c;i++;continue}if(c==='"'){state='double';cur+=c;i++;continue}
  if(c==='$'){const m=sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);if(m){tag=m[0];state='dollar';cur+=tag;i+=tag.length;continue}}
  if(c===';'){if(cur.trim())out.push(cur.trim());cur='';i++;continue}cur+=c;i++}
 if(!['code','line'].includes(state))throw new Error(`unterminated SQL ${state}`);if(cur.trim())out.push(cur.trim());return out;
}
export function scanSql(sql){
 let out='',i=0,state='code',depth=0,tag='';
 while(i<sql.length){const c=sql[i],n=sql[i+1];
  if(state==='line'){out+=c==='\n'?'\n':' ';if(c==='\n')state='code';i++;continue}
  if(state==='block'){out+=' ';if(c==='/'&&n==='*'){depth++;out+=' ';i+=2;continue}if(c==='*'&&n==='/'){depth--;out+=' ';i+=2;if(!depth)state='code';continue}i++;continue}
  if(state==='single'){out+=' ';if(c==="'"&&n==="'"){out+=' ';i+=2;continue}if(c==="'")state='code';i++;continue}
  if(state==='dollar'){out+=' ';if(sql.startsWith(tag,i)){out+=' '.repeat(tag.length-1);i+=tag.length;state='code'}else i++;continue}
  if(c==='-'&&n==='-'){out+='  ';i+=2;state='line';continue}if(c==='/'&&n==='*'){out+='  ';i+=2;state='block';depth=1;continue}
  if(c==="'"){out+=' ';i++;state='single';continue}
  if(c==='$'){const m=sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);if(m){tag=m[0];out+=' '.repeat(tag.length);i+=tag.length;state='dollar';continue}}
  out+=c;i++}
 if(!['code','line'].includes(state))throw new Error(`unterminated SQL ${state}`);return out;
}
export function extractCallBodies(sql,functionName){
 const clean=scanSql(sql),out=[],pattern=new RegExp(`\\b${functionName}\\s*\\(`,'ig');let match;
 while((match=pattern.exec(clean))){
  const open=clean.indexOf('(',match.index),start=open+1;let depth=1,i=start;
  for(;i<clean.length&&depth;i++){if(clean[i]==='(')depth++;else if(clean[i]===')')depth--}
  if(depth)throw new Error(`unterminated ${functionName} call`);
  out.push(sql.slice(start,i-1));pattern.lastIndex=i;
 }
 return out;
}
const reEscape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function extractDollarQuotedFunctionBody(sql,functionName){
 const name=reEscape(functionName);
 const pattern=new RegExp(`CREATE\\s+FUNCTION\\s+public\\.${name}\\s*\\(\\s*\\)[\\s\\S]*?\\bAS\\s+(\\$[A-Za-z_][A-Za-z0-9_]*\\$|\\$\\$)([\\s\\S]*?)\\1\\s*;`,'i');
 const match=sql.match(pattern);
 if(!match)throw new Error(`versioned function body missing: ${functionName}`);
 const duplicates=sql.match(new RegExp(`CREATE\\s+FUNCTION\\s+public\\.${name}\\s*\\(\\s*\\)`,'ig'))||[];
 if(duplicates.length!==1)throw new Error(`versioned function body is not unique: ${functionName}`);
 return Object.freeze({delimiter:match[1],body:match[2]});
}
export function toTestProsrcRepresentation(body){
 return body.replace(/\r\n|\r/g,'\n').replace(/\n/g,'\r\n');
}
const md5Text=value=>crypto.createHash('md5').update(value,'utf8').digest('hex');
export function fingerprintBodyCandidates(body){
 const lf=body.replace(/\r\n|\r/g,'\n'),bases={exact:body,lf,crlf:lf.replace(/\n/g,'\r\n')},out={};
 for(const [name,value] of Object.entries(bases)){
  const dropFirst=value.replace(/^(?:\r\n|\n|\r)/,'');
  const dropLast=value.replace(/(?:\r\n|\n|\r)$/,'');
  out[name]=md5Text(value);
  out[`${name}-drop-first`]=md5Text(dropFirst);
  out[`${name}-drop-last`]=md5Text(dropLast);
  out[`${name}-drop-both`]=md5Text(dropFirst.replace(/(?:\r\n|\n|\r)$/,''));
  out[`${name}-trim`]=md5Text(value.trim());
 }
 return Object.freeze(out);
}
export function fingerprintVersionedFunctionBodies(sql){
 return Object.freeze(Object.fromEntries(FUNCTIONS.map(name=>{
  const {body}=extractDollarQuotedFunctionBody(sql,name);
  const represented=toTestProsrcRepresentation(body);
  return [name,md5Text(represented)];
 })));
}
const norm=s=>s.replace(/\s+/g,' ').trim().toLowerCase();
const need=(v,m,e)=>{if(!v)e.push(m)};
const exactMigration=()=>[
 'BEGIN',
 'ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public',
 ...FUNCTIONS.map(n=>`REVOKE EXECUTE ON FUNCTION public.${n}() FROM PUBLIC, anon, authenticated, service_role`),
 'COMMIT'
].map(norm);
const exactRollback=()=>[
 'BEGIN','ALTER FUNCTION public.handle_new_user() RESET search_path',
 ...FUNCTIONS.map(n=>`GRANT EXECUTE ON FUNCTION public.${n}() TO PUBLIC, anon, authenticated, service_role`),
 'COMMIT'
].map(norm);

export function validateFunctionHardeningPackage(files,sourceSql){
 const e=[];for(const k of Object.keys(FILES))need(typeof files[k]==='string'&&files[k].trim(),`${k}: missing`,e);
 if(e.length)return e;
 const {preflight:p,migration:m,postverify:v,rollback:r}=files;
 let ps,ms,vs,rs;try{ps=splitSqlStatements(p);ms=splitSqlStatements(m);vs=splitSqlStatements(v);rs=splitSqlStatements(r)}catch(err){return [err.message]}
 need(ps.length===4,'preflight: expected four statements',e);need(ms.length===9,'migration: expected nine statements',e);
 need(vs.length===3,'postverify: expected three statements',e);need(rs.length===9,'rollback: expected nine statements',e);
 need(ps.every(s=>/^WITH\b|^SELECT\b/i.test(s)),'preflight: SELECT/CTE only',e);
 need(vs.every(s=>/^WITH\b|^SELECT\b/i.test(s)),'postverify: SELECT/CTE only',e);
 const forbiddenRead=/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|DO|COPY|LOCK)\b/i;
 need(!forbiddenRead.test(scanSql(p)),'preflight: mutation/control forbidden',e);need(!forbiddenRead.test(scanSql(v)),'postverify: mutation/control forbidden',e);
 need(JSON.stringify(ms.map(norm))===JSON.stringify(exactMigration()),'migration: exact allowlist mismatch',e);
 need(JSON.stringify(rs.map(norm))===JSON.stringify(exactRollback()),'rollback: exact inverse allowlist mismatch',e);
 for(const name of FUNCTIONS){
  need(new RegExp(`['\"]${name}['\"]`).test(p),`preflight: missing ${name}`,e);
  need(new RegExp(`['\"]${name}['\"]`).test(v),`postverify: missing ${name}`,e);
 }
 need((p.match(/AS apt_to_apply/g)||[]).length>=4,'preflight: explicit apt flags required',e);
 need(/has_schema_privilege\('anon',[\s\S]*'CREATE'\)/.test(p)&&/has_schema_privilege\('authenticated',[\s\S]*'CREATE'\)/.test(p),'preflight: schema CREATE checks missing',e);
 need(/x\.grantee\s*=\s*0[\s\S]*x\.privilege_type\s*=\s*'CREATE'/.test(p),'preflight: PUBLIC CREATE check missing',e);
 const nameArraySources=/(?:\b(?:rolname|proname|nspname|relname|tgname|attname|role_name)\b|pg_catalog\.pg_get_userbyid\s*\()/i;
 const catalogNameArrays=extractCallBodies(p+v,'array_agg').filter(body=>nameArraySources.test(body));
 need(catalogNameArrays.length===1,'package: unexpected catalog-name array_agg inventory',e);
 for(const body of catalogNameArrays){
  const expression=body.split(/\bORDER\s+BY\b/i)[0];
  need(/\)::text\s*$/i.test(expression.trim()),'package: catalog-name array_agg element must be cast to text',e);
  need(/^\s*DISTINCT\b/i.test(expression),'package: ACL grantees must remain deduplicated',e);
  need(/\bORDER\s+BY\b[\s\S]*\)::text\s*$/i.test(body.trim()),'package: ACL grantees need deterministic text ordering',e);
 }
 need(/acl\.execute_grantees\s*=\s*ARRAY\s*\[\s*'PUBLIC'\s*,\s*'anon'\s*,\s*'authenticated'\s*,\s*'postgres'\s*,\s*'service_role'\s*\]\s*::\s*text\[\]/i.test(p),'preflight: exact five canonical grantees missing',e);
 need(/md5\(p\.prosrc\)/.test(p)&&/md5\(p\.prosrc\)/.test(v),'package: body fingerprint missing',e);
 need(/security_matches[\s\S]*kind_matches[\s\S]*signature_matches[\s\S]*expected_body_md5[\s\S]*observed_body_md5[\s\S]*body_hash_matches/.test(p),'preflight: body predicate diagnostics missing',e);
 need(!/SELECT[\s\S]*\bp\.prosrc\b(?!\s*\))/.test(scanSql(p+v)),'package: raw prosrc output forbidden',e);
 if(typeof sourceSql==='string'){
  let derived;
  try{derived=fingerprintVersionedFunctionBodies(sourceSql)}catch(err){e.push(err.message)}
  if(derived){for(const name of FUNCTIONS){
   const hash=derived[name];
   need(new RegExp(`['"]${name}['"]\\s*,\\s*['"]${hash}['"]`).test(p),`preflight: ${name} fingerprint is not derived from versioned body`,e);
   need(new RegExp(`['"]${name}['"]\\s*,\\s*['"]${hash}['"]`).test(v),`postverify: ${name} fingerprint is not derived from versioned body`,e);
  }}
 }
 need(!/pg_get_functiondef/i.test(p+v),'package: function bodies forbidden',e);
 need(!/\bCREATE\s+OR\s+REPLACE\b/i.test(scanSql(Object.values(files).join('\n'))),'package: CREATE OR REPLACE forbidden',e);
 need(!/\b(?:EXECUTE\s+format|quote_ident|quote_literal)\b/i.test(scanSql(Object.values(files).join('\n'))),'package: dynamic SQL forbidden',e);
 need(!/\bALTER\s+(?:TRIGGER|TABLE|SCHEMA)|\bCREATE\s+(?:FUNCTION|TRIGGER)|\bDROP\b/i.test(scanSql(m+r)),'migration/rollback: unrelated DDL forbidden',e);
 need((v.match(/matches_expected/g)||[]).length>=3,'postverify: structural matches required',e);
 need(TRIGGERS.every(t=>p.includes(`'${t}'`)&&v.includes(`'${t}'`)),'trigger manifest incomplete',e);
 need(/SET search_path = pg_catalog, public/i.test(m),'migration: exact search_path missing',e);
 need(!/SET search_path\s*=\s*(?:public|[^;]*(?:\$user|pg_temp|temp))/i.test(m),'migration: unsafe search_path',e);
 need(/RESET search_path/i.test(r),'rollback: search_path reset missing',e);
 need(/cannot promise byte-for-byte proacl/i.test(r),'rollback: honest ACL limitation missing',e);
 need(!/restores? (?:the )?(?:exact|byte-for-byte) proacl/i.test(r),'rollback: false catalog identity claim',e);
 need(/PostgreSQL 15\.8[\s\S]*17\.6|PG15[\s\S]*PG17/i.test(p+m+v+r),'package: PG15/PG17 compatibility declaration missing',e);
 return e;
}
export function validateProductionFunctionPreflight(sql,sourceSql){
 const e=[];let statements;try{statements=splitSqlStatements(sql)}catch(err){return [err.message]}
 need(statements.length===1,'production preflight: one statement required',e);
 need(/^WITH\b/i.test(statements[0]||'')&&/AS production_preflight_result/.test(sql),'production preflight: one structured output required',e);
 const forbidden=/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|DO|COPY|LOCK|BEGIN|COMMIT|ROLLBACK|set_config|pg_sleep|dblink|http_|net\.)\b/i;
 need(!forbidden.test(scanSql(sql)),'production preflight: read-only contract violated',e);
 need(/preflight productivo/i.test(sql)&&!/Execute only in Supabase test|Do not execute in production/i.test(sql),'production preflight: classification invalid',e);
 need(sql.includes("'expected_project_name','educativo-backend'")&&sql.includes("'expected_project_ref','bfnkaqmhcsyxdxoqnahk'")&&sql.includes("'expected_region','us-east-2'"),'production preflight: expected identity missing',e);
 need(sql.includes("'project_ref_verified_by_sql',false")&&sql.includes("'visual_project_ref_confirmation_required',true")&&sql.includes("'catalog_check_does_not_verify_project_ref',true"),'production preflight: human identity boundary missing',e);
 need((sql.match(/^ \('(?:enforce_|handle_new_user|set_updated_at)/gm)||[]).length===6,'production preflight: six-function manifest required',e);
 need(FUNCTIONS.every(name=>sql.includes(`'${name}'`)), 'production preflight: function inventory incomplete',e);
 need(TRIGGERS.every(name=>sql.includes(`'${name}'`)), 'production preflight: trigger inventory incomplete',e);
 need((sql.match(/^ \('(?:auth|public)','[^']+','(?:on_auth|set_|trg_)/gm)||[]).length===16,'production preflight: sixteen-trigger manifest required',e);
 for(const field of ['owner_name','identity_arguments','result_type','language_name','function_kind','security_definer','volatility','parallel_safety','proconfig','expected_body_md5','observed_body_md5','execute_grantees','matches_baseline'])need(sql.includes(field),`production preflight: missing function field ${field}`,e);
 if(typeof sourceSql==='string'){
  let hashes;try{hashes=fingerprintVersionedFunctionBodies(sourceSql)}catch(err){e.push(err.message)}
  if(hashes)for(const [name,hash] of Object.entries(hashes))need(new RegExp(`['"]${name}['"]\s*,\s*['"]${hash}['"]`).test(sql),`production preflight: ${name} fingerprint not derived`,e);
 }
 need(/unexpected_trigger_count=0/.test(sql),'production preflight: alternative trigger detection missing',e);
 need(/matched_03d3a_constraint_count=14[\s\S]*changed_03d3a_constraint_count=0[\s\S]*unexpected_03d3a_constraint_count=0/.test(sql),'production preflight: 03D3A exact baseline missing',e);
 need(/current_setting\('server_version_num'\)::integer=150008/.test(sql),'production preflight: PostgreSQL 15.8 gate missing',e);
 need(/current_user='postgres' AND session_user='postgres'/.test(sql),'production preflight: authority gate missing',e);
 need(/'apt_to_apply',catalog_context_matches AND server_context_matches AND authority_context_matches/.test(sql),'production preflight: fail-closed decision missing',e);
 need(!/pg_get_functiondef/i.test(sql),'production preflight: raw function definitions forbidden',e);
 need(!/SELECT[\s\S]*\bp\.prosrc\b(?!\s*\))/i.test(scanSql(sql)),'production preflight: raw function body output forbidden',e);
 need(!/\b(?:NULLS\s+NOT\s+DISTINCT|PERIOD|ENFORCED)\b/i.test(scanSql(sql)),'production preflight: syntax outside PostgreSQL 15 contract',e);
 return e;
}
export function validateProductionFunctionPackage(files,sourceSql){
 const e=[];for(const k of Object.keys(PRODUCTION_FILES))need(typeof files[k]==='string'&&files[k].trim(),`production ${k}: missing`,e);
 if(e.length)return e;
 const {migration:m,postverify:p,rollback:r}=files;let ms,ps,rs;
 try{ms=splitSqlStatements(m);ps=splitSqlStatements(p);rs=splitSqlStatements(r)}catch(err){return [err.message]}
 need(ms[0]&&norm(ms[0])==='begin'&&norm(ms.at(-1))==='commit','production migration: one transaction required',e);
 need(rs[0]&&norm(rs[0])==='begin'&&norm(rs.at(-1))==='commit','production rollback: one transaction required',e);
 need(ps.length===1&&/^WITH\b/i.test(ps[0])&&/AS production_postverify_result/.test(p),'production postverify: one structured statement required',e);
 need((m.match(/\bLOCK TABLE\b/g)||[]).length===1&&/IN ACCESS SHARE MODE/.test(m),'production migration: minimal DDL-stability lock missing',e);
 need((r.match(/\bLOCK TABLE\b/g)||[]).length===1&&/IN ACCESS SHARE MODE/.test(r),'production rollback: minimal DDL-stability lock missing',e);
 need(m.indexOf('AS immediate_baseline_gate')>0&&m.indexOf('AS immediate_baseline_gate')<m.indexOf('ALTER FUNCTION'),'production migration: baseline gate must precede mutation',e);
 need(r.indexOf('AS immediate_rollback_gate')>0&&r.indexOf('AS immediate_rollback_gate')<r.indexOf('ALTER FUNCTION'),'production rollback: installed-state gate must precede mutation',e);
 need((m.match(/ALTER FUNCTION public\.handle_new_user\(\) SET search_path = pg_catalog, public/g)||[]).length===1,'production migration: exact search_path change missing',e);
 need((m.match(/REVOKE EXECUTE ON FUNCTION public\./g)||[]).length===6,'production migration: six revocations required',e);
 need((r.match(/ALTER FUNCTION public\.handle_new_user\(\) RESET search_path/g)||[]).length===1,'production rollback: exact search_path inverse missing',e);
 need((r.match(/GRANT EXECUTE ON FUNCTION public\./g)||[]).length===6,'production rollback: six grants required',e);
 for(const name of FUNCTIONS){for(const [kind,sql] of Object.entries(files))need(sql.includes(name),`production ${kind}: missing ${name}`,e)}
 need(TRIGGERS.every(name=>m.includes(name)&&p.includes(name)&&r.includes(name)),'production package: exact trigger manifest incomplete',e);
 for(const sql of [m,p,r])need((sql.match(/'educativo_ia_/g)||[]).length>=14,'production package: 03D3A manifest incomplete',e);
 need(/function_count=6 AND matched_function_count=6/.test(p)&&/matched_trigger_count=16/.test(p)&&/matched_03d3a_constraint_count=14/.test(p),'production postverify: exact counts missing',e);
 need(/'postverify_ok'/.test(p)&&/unexpected_function_count/.test(p)&&/unexpected_trigger_count/.test(p)&&/unexpected_03d3a_constraint_count/.test(p),'production postverify: fail-closed output missing',e);
 const forbiddenRead=/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|DO|COPY|LOCK|BEGIN|COMMIT|ROLLBACK|set_config|pg_sleep|dblink|http_|net\.)\b/i;
 need(!forbiddenRead.test(scanSql(p)),'production postverify: read-only contract violated',e);
 need(!/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|DROP|CALL|DO|COPY)\b/i.test(scanSql(m+r)),'production mutation package: out-of-scope command',e);
 need(!/\b(?:ALTER TABLE|ALTER TRIGGER|CREATE OR REPLACE|CASCADE)\b/i.test(scanSql(m+r)),'production mutation package: unrelated DDL/CASCADE forbidden',e);
 need(!/pg_get_functiondef/i.test(m+p+r)&&!/SELECT[\s\S]*\bp\.prosrc\b(?!\s*\))/i.test(scanSql(m+p+r)),'production package: raw bodies forbidden',e);
 need(!/\b(?:email|full_name|token|password|authorization|contenido|tabla_ia)\b/i.test(m+p+r),'production package: sensitive fields forbidden',e);
 need(!/\b(?:NULLS\s+NOT\s+DISTINCT|PERIOD|ENFORCED)\b/i.test(scanSql(m+p+r)),'production package: syntax outside PostgreSQL 15',e);
 if(typeof sourceSql==='string'){
  let hashes;try{hashes=fingerprintVersionedFunctionBodies(sourceSql)}catch(err){e.push(err.message)}
  if(hashes)for(const [name,hash] of Object.entries(hashes))for(const [kind,sql] of Object.entries(files))need(sql.includes(`'${name}','${hash}'`),`production ${kind}: ${name} fingerprint not derived`,e);
 }
 return e;
}
export function loadPackage(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 return Object.fromEntries(Object.entries(FILES).map(([k,f])=>[k,fs.readFileSync(path.join(root,f),'utf8')]));
}
export function loadVersionedFunctionSource(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 return fs.readFileSync(path.join(root,FUNCTION_SOURCE),'utf8');
}
export function loadProductionPreflight(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 return fs.readFileSync(path.join(root,PRODUCTION_PREFLIGHT),'utf8');
}
export function loadProductionPackage(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 return Object.fromEntries(Object.entries(PRODUCTION_FILES).map(([k,f])=>[k,fs.readFileSync(path.join(root,f),'utf8')]));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const source=loadVersionedFunctionSource();
 const errors=[...validateFunctionHardeningPackage(loadPackage(),source),...validateProductionFunctionPreflight(loadProductionPreflight(),source),...validateProductionFunctionPackage(loadProductionPackage(),source)];
 if(errors.length){for(const x of errors)console.error(x);process.exitCode=1}else console.log('03D3C1 function-hardening SQL package: PASS');
}
