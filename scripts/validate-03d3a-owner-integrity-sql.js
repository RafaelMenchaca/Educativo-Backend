import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILES=Object.freeze({
  preflight:'docs/test-environment/03d3a_owner_integrity_preflight.sql',
  migration:'docs/test-environment/03d3a_owner_integrity_migration.sql',
  postverify:'docs/test-environment/03d3a_owner_integrity_postverify.sql',
  rollback:'docs/test-environment/03d3a_owner_integrity_rollback.sql'
});
export const PRODUCTION_PREFLIGHT='docs/production/03d3a_owner_integrity_prod_preflight.sql';
export const RELATIONS=Object.freeze([
 'planeaciones.batch_id','anexos.planeacion_id','anexos.batch_id',
 'listas_cotejo.planeacion_id','listas_cotejo.batch_id','examenes.unidad_id',
 'examenes.batch_id','examen_generation_items.job_id','examenes.generation_job_id'
]);

export function splitSqlStatements(sql){
 const statements=[];let current='',i=0,state='code',blockDepth=0,dollarTag='';
 while(i<sql.length){
  const c=sql[i],n=sql[i+1];
  if(state==='line'){if(c==='\n'){state='code';current+='\n'}i++;continue}
  if(state==='block'){
   if(c==='/'&&n==='*'){blockDepth++;i+=2;continue}
   if(c==='*'&&n==='/'){blockDepth--;i+=2;if(blockDepth===0)state='code';continue}
   i++;continue;
  }
  if(state==='single'){current+=c;if(c==="'"&&n==="'"){current+=n;i+=2;continue}if(c==="'")state='code';i++;continue}
  if(state==='double'){current+=c;if(c==='"'&&n==='"'){current+=n;i+=2;continue}if(c==='"')state='code';i++;continue}
  if(state==='dollar'){
   if(sql.startsWith(dollarTag,i)){current+=dollarTag;i+=dollarTag.length;state='code'}else{current+=c;i++}
   continue;
  }
  if(c==='-'&&n==='-'){state='line';i+=2;continue}
  if(c==='/'&&n==='*'){state='block';blockDepth=1;i+=2;continue}
  if(c==="'"){state='single';current+=c;i++;continue}
  if(c==='"'){state='double';current+=c;i++;continue}
  if(c==='$'){
   const match=sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
   if(match){dollarTag=match[0];state='dollar';current+=dollarTag;i+=dollarTag.length;continue}
  }
  if(c===';'){if(current.trim())statements.push(current.trim());current='';i++;continue}
  current+=c;i++;
 }
 if(state!=='code'&&state!=='line')throw new Error(`unterminated SQL ${state}`);
 if(current.trim())statements.push(current.trim());
 return statements;
}
const strip=s=>splitSqlStatements(s).join(';\n').replace(/'(?:''|[^'])*'/g,"''");
const count=(s,re)=>(s.match(re)||[]).length;
const need=(ok,msg,errors)=>{if(!ok)errors.push(msg)};
export function validateOwnerIntegrityPackage(files){
 const errors=[],p=files.preflight,m=files.migration,v=files.postverify,r=files.rollback;
 for(const [name,text] of Object.entries(files))need(typeof text==='string'&&text.trim(),`${name}: missing`,errors);
 const ps=strip(p),ms=strip(m),vs=strip(v),rs=strip(r);
 need(splitSqlStatements(p).length===9,'preflight: expected nine statements',errors);
 need(splitSqlStatements(m).length===16,'migration: expected sixteen statements',errors);
 need(splitSqlStatements(v).length===2,'postverify: expected two statements',errors);
 need(splitSqlStatements(r).length===16,'rollback: expected sixteen statements',errors);
 need(count(p,/AS check_name/g)===9,'preflight: expected nine checks',errors);
 for(const rel of RELATIONS)need(p.includes(`'${rel}' AS check_name`),`preflight: missing ${rel}`,errors);
 need(!/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|CALL|DO|COPY)\b/i.test(ps),'preflight: not read-only',errors);
 need(count(p,/AS mismatch_count/g)===9&&count(p,/AS orphan_count/g)===9,'preflight: mismatch/orphan contract',errors);
 need(count(p,/AS child_owner_null_count/g)===9&&count(p,/AS parent_owner_null_count/g)===9,'preflight: null-owner contract',errors);
 need(count(p,/AS parent_key_duplicate_count/g)===9&&count(p,/AS optional_reference_count/g)===9,'preflight: duplicate/optional contract',errors);
 need(/^\s*BEGIN;/m.test(m)&&/COMMIT;\s*$/m.test(m),'migration: transaction required',errors);
 need(count(m,/ADD CONSTRAINT educativo_ia_\w+_owner_fkey/g)===9,'migration: nine owner foreign keys required',errors);
 need(count(m,/UNIQUE \(id, user_id\)/g)===4,'migration: four parent unique keys required',errors);
 need(m.includes('CHECK (batch_id IS NULL OR user_id IS NOT NULL)'),'migration: nullable planeacion owner guard missing',errors);
 need(!/^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/im.test(ms),'migration: data DML forbidden',errors);
 need(!/DROP\s+[^;]*CASCADE/i.test(ms),'migration: DROP CASCADE forbidden',errors);
 need(!/DISABLE\s+ROW\s+LEVEL\s+SECURITY|NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(ms),'migration: RLS modification forbidden',errors);
 need(!/\b(GRANT|REVOKE|POLICY)\b/i.test(ms),'migration: ACL/policy modification forbidden',errors);
 need(!/\b(EXECUTE|format\s*\(|quote_ident|quote_literal)\b/i.test(ms),'migration: dynamic SQL forbidden',errors);
 need(!/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|TRIGGER)\b/i.test(ms),'migration: functions and triggers forbidden',errors);
 need(count(m,/ON DELETE CASCADE/g)===4,'migration: four CASCADE semantics required',errors);
 need(count(m,/ON DELETE SET NULL \([a-z_]+\)/g)===5,'migration: five column-scoped SET NULL semantics required',errors);
 need(!/ON DELETE SET NULL\s*(?:;|$)/im.test(m),'migration: unscoped composite SET NULL forbidden',errors);
 need(count(m,/MATCH SIMPLE ON UPDATE NO ACTION ON DELETE/g)===9,'migration: explicit MATCH/UPDATE semantics required',errors);
 need(count(v,/educativo_ia_[a-z_]+/g)>=14,'postverify: complete expected object manifest required',errors);
 need(/confmatchtype/.test(v)&&/confupdtype/.test(v)&&/confdeltype/.test(v)&&/confdelsetcols/.test(v),'postverify: referential metadata required',errors);
 need(/child_columns/.test(v)&&/parent_columns/.test(v)&&/child_types/.test(v)&&/parent_types/.test(v),'postverify: ordered columns and types required',errors);
 need(count(v,/array_agg\(a\.attname::text ORDER BY k\.position\)/g)===3,'postverify: three name-to-text casts required',errors);
 need(!/array_agg\(a\.attname ORDER BY k\.position\)/.test(v),'postverify: name[] regression detected',errors);
 need(count(v,/matches_expected/g)===2,'postverify: exact comparisons required',errors);
 need(!/pg_get_functiondef|prosrc/i.test(vs),'postverify: function bodies forbidden',errors);
 need(/^\s*BEGIN;/m.test(r)&&/COMMIT;\s*$/m.test(r),'rollback: transaction required',errors);
 need(count(r,/DROP CONSTRAINT educativo_ia_/g)===14,'rollback: exactly fourteen owned constraints',errors);
 need(!/DROP\s+[^;]*CASCADE/i.test(rs),'rollback: DROP CASCADE forbidden',errors);
 need(!/DROP CONSTRAINT (?!educativo_ia_)/i.test(rs),'rollback: historical constraint removal forbidden',errors);
 need(!/^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/im.test(rs),'rollback: data DML forbidden',errors);
 const drops=splitSqlStatements(r).slice(1,-1);
 need(drops.slice(0,9).every(s=>/_owner_fkey$/.test(s)),'rollback: child foreign keys must be removed first',errors);
 need(drops[9]?.endsWith('educativo_ia_planeaciones_batch_owner_present'),'rollback: checks must follow child foreign keys',errors);
 need(drops.slice(10).every(s=>/_id_user_key$/.test(s)),'rollback: parent unique keys must be removed last',errors);
 return errors;
}
export function validateProductionPreflight(sql){
 const errors=[],statements=splitSqlStatements(sql),normalized=strip(sql);
 need(statements.length===1,'production preflight: expected one statement',errors);
 need(/^WITH\b/i.test(statements[0]||'')&&/\bSELECT\s+jsonb_build_object\s*\(/i.test(normalized),'production preflight: one structured SELECT required',errors);
 need(!/\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|CREATE|DROP|GRANT|REVOKE|COMMENT|CALL|DO|COPY|BEGIN|COMMIT|ROLLBACK|SECURITY\s+DEFINER|set_config|pg_sleep|dblink|http_|net\.)\b/i.test(normalized),'production preflight: read-only contract violated',errors);
 need(sql.includes("'expected_project_name','educativo-backend'")&&sql.includes("'expected_project_ref','bfnkaqmhcsyxdxoqnahk'"),'production preflight: expected production identity missing',errors);
 need(sql.includes("'project_ref_verified_by_sql',false")&&sql.includes("'visual_project_ref_confirmation_required',true")&&sql.includes("'catalog_check_does_not_verify_project_ref',true"),'production preflight: project identity boundary missing',errors);
 need(count(sql,/AS check_name/g)===1&&count(sql,/SELECT '\w[^']*\.[^']*'/g)>=8,'production preflight: nine integrity checks required',errors);
 for(const rel of RELATIONS)need(sql.includes(`'${rel}'`),`production preflight: missing ${rel}`,errors);
 for(const field of ['mismatch_count','orphan_count','child_owner_null_count','parent_owner_null_count','parent_key_duplicate_count','optional_reference_count'])need(sql.includes(`'${field}'`),`production preflight: missing ${field}`,errors);
 need(count(sql,/educativo_ia_[a-z_]+/g)>=14,'production preflight: complete target constraint manifest required',errors);
 for(const field of ['expected_tables','expected_columns','expected_baseline_constraints','missing_table_count','missing_or_changed_column_count','missing_or_changed_constraint_count','present_target_constraint_count','unexpected_relevant_constraint_count','catalog_context_matches'])need(sql.includes(field),`production preflight: missing catalog contract ${field}`,errors);
 need(/'apt_to_apply',catalog_context_matches\s+AND\s+check_count=9\s+AND\s+total_blocking_count=0/i.test(sql),'production preflight: fail-closed apt_to_apply missing',errors);
 need(!/SELECT\s+[^;]*(?:c|p)\.(?:id|user_id)\s*(?:,|AS)/i.test(sql),'production preflight: row identifiers exposed',errors);
 return errors;
}
export function loadPackage(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 return Object.fromEntries(Object.entries(FILES).map(([k,f])=>[k,fs.readFileSync(path.join(root,f),'utf8')]));
}
export function loadProductionPreflight(root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')){
 return fs.readFileSync(path.join(root,PRODUCTION_PREFLIGHT),'utf8');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const errors=[...validateOwnerIntegrityPackage(loadPackage()),...validateProductionPreflight(loadProductionPreflight())];
 if(errors.length){for(const e of errors)console.error(e);process.exitCode=1}else console.log('03D3A owner-integrity SQL package: PASS');
}
