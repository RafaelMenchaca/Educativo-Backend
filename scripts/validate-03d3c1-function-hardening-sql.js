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
export function loadPackage(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 return Object.fromEntries(Object.entries(FILES).map(([k,f])=>[k,fs.readFileSync(path.join(root,f),'utf8')]));
}
export function loadVersionedFunctionSource(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 return fs.readFileSync(path.join(root,FUNCTION_SOURCE),'utf8');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const errors=validateFunctionHardeningPackage(loadPackage(),loadVersionedFunctionSource());
 if(errors.length){for(const x of errors)console.error(x);process.exitCode=1}else console.log('03D3C1 function-hardening SQL package: PASS');
}
