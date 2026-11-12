#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
export const SQL_FILE=path.resolve(here,'../docs/test-environment/03d3c2_b1_authenticated_dml_preflight.sql');
export const DOC_FILE=path.resolve(here,'../docs/ISOLATION_03D3C2_B1.md');
export const OPERATIONS=Object.freeze(['SELECT','INSERT','UPDATE','DELETE']);
const all=(value,classification,consumer)=>Object.fromEntries(OPERATIONS.map(op=>[op,Object.freeze({grant:value,classification,consumer})]));
export const B1_MATRIX=Object.freeze({
 ai_generation_calls:all(true,'DECISION_REQUIRED','admin metrics; transfer B4'),
 ai_generation_jobs:all(true,'DECISION_REQUIRED','admin metrics; transfer B4'),
 ai_model_prices:Object.freeze({SELECT:{grant:true,classification:'DECISION_REQUIRED',consumer:'admin metrics; transfer B4'},INSERT:{grant:false,classification:'NOT_GRANTED',consumer:'none'},UPDATE:{grant:false,classification:'NOT_GRANTED',consumer:'none'},DELETE:{grant:false,classification:'NOT_GRANTED',consumer:'none'}}),
 anexos:all(true,'KEEP','authenticated derived-resource API'),
 examen_generation_items:Object.freeze({SELECT:{grant:true,classification:'KEEP',consumer:'authenticated polling/context'},INSERT:{grant:true,classification:'KEEP',consumer:'authenticated exam prepare'},UPDATE:{grant:true,classification:'TEST_ONLY_DEPENDENCY',consumer:'admin worker; authenticated harness/recovery'},DELETE:{grant:true,classification:'TEST_ONLY_DEPENDENCY',consumer:'authenticated harness/recovery'}}),
 examen_generation_jobs:Object.freeze({SELECT:{grant:true,classification:'KEEP',consumer:'authenticated polling'},INSERT:{grant:true,classification:'KEEP',consumer:'authenticated exam prepare'},UPDATE:{grant:true,classification:'KEEP',consumer:'authenticated prepare compensation'},DELETE:{grant:true,classification:'TEST_ONLY_DEPENDENCY',consumer:'authenticated harness/recovery'}}),
 examenes:Object.freeze({SELECT:{grant:true,classification:'KEEP',consumer:'Biblioteca and exam API'},INSERT:{grant:true,classification:'TEST_ONLY_DEPENDENCY',consumer:'admin worker; authenticated harness'},UPDATE:{grant:true,classification:'TEST_ONLY_DEPENDENCY',consumer:'admin worker; authenticated harness'},DELETE:{grant:true,classification:'KEEP',consumer:'authenticated exam/Biblioteca delete'}}),
 grados:all(true,'KEEP','authenticated frozen hierarchy API'),
 ia_metrics_legacy:all(false,'NOT_GRANTED','none'),
 listas_cotejo:all(true,'KEEP','authenticated derived-resource API'),
 materias:all(true,'KEEP','authenticated frozen hierarchy API'),
 planeacion_batches:Object.freeze({SELECT:{grant:true,classification:'KEEP',consumer:'Biblioteca'},INSERT:{grant:true,classification:'TEST_ONLY_DEPENDENCY',consumer:'admin generation; authenticated harness'},UPDATE:{grant:true,classification:'TEST_ONLY_DEPENDENCY',consumer:'authenticated harness'},DELETE:{grant:true,classification:'KEEP',consumer:'Biblioteca block delete'}}),
 planeaciones:all(true,'KEEP','authenticated Biblioteca/Archivados/Quick Create'),
 planteles:all(true,'KEEP','authenticated frozen hierarchy API'),
 profiles:all(true,'DECISION_REQUIRED','Auth provisioning/account surface; transfer B4'),
 temas:Object.freeze({SELECT:{grant:true,classification:'KEEP',consumer:'Quick Create/resources'},INSERT:{grant:true,classification:'KEEP',consumer:'authenticated frozen hierarchy API'},UPDATE:{grant:true,classification:'TEST_ONLY_DEPENDENCY',consumer:'authenticated ownership harness'},DELETE:{grant:true,classification:'KEEP',consumer:'authenticated frozen hierarchy API'}}),
 unidades:all(true,'KEEP','authenticated frozen hierarchy/exams API'),
 user_profiles:all(true,'DECISION_REQUIRED','no product consumer; transfer B4'),
 user_settings:all(true,'DECISION_REQUIRED','Auth provisioning/account surface; transfer B4'),
});

function strip(sql){return sql.replace(/--[^\r\n]*/g,' ').replace(/\/\*[\s\S]*?\*\//g,' ').replace(/'(?:''|[^'])*'/g,"''")}
function statements(sql){sql=sql.replace(/--[^\r\n]*/g,' ').replace(/\/\*[\s\S]*?\*\//g,' ');const out=[];let quote=false,start=0;for(let i=0;i<sql.length;i++){if(sql[i]==="'"&&quote&&sql[i+1]==="'"){i++;continue}if(sql[i]==="'")quote=!quote;if(sql[i]===';'&&!quote){out.push(sql.slice(start,i+1));start=i+1}}return out.filter(x=>x.trim())}
export function validateB1Audit({sql=fs.readFileSync(SQL_FILE,'utf8'),doc=fs.readFileSync(DOC_FILE,'utf8')}={}){
 const errors=[];const tables=Object.keys(B1_MATRIX);
 if(tables.length!==19||new Set(tables).size!==19)errors.push('table manifest must be 19 unique tables');
 if(OPERATIONS.length!==4||new Set(OPERATIONS).size!==4)errors.push('operation manifest must be four unique DML operations');
 for(const [table,ops] of Object.entries(B1_MATRIX))for(const op of OPERATIONS){if(!ops[op])errors.push(`missing ${table}.${op}`);if(!doc.includes(`| \`${table}\` |`))errors.push(`document missing ${table}`)}
 if(statements(sql).length!==4)errors.push('preflight must contain four statements');
 if(/\b(?:ALTER|CREATE|DROP|GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|CALL|DO|COPY)\b/i.test(strip(sql)))errors.push('preflight is not read-only');
 for(const table of tables)if((sql.match(new RegExp(`\\('${table}'\\)`,'g'))||[]).length!==2)errors.push(`SQL table manifest mismatch: ${table}`);
 for(const op of OPERATIONS)if(!sql.includes(`('${op}')`))errors.push(`SQL missing operation ${op}`);
 for(const token of ['direct_grant','effective_grant','inherited_or_public_effect','grantor_matches','is_grantable','rls_enabled','rls_forced','policy_name','roles','minimum_depth','tables_exact','policies_exact','authenticated_grants_exact','membership_paths_absent','matrix_cardinality_ok','b1_c1_ready_count','unresolved_operation_count','apt_to_apply'])if(!sql.includes(token))errors.push(`SQL missing ${token}`);
 if((sql.match(/role_name::text FROM pg_catalog\.unnest\(p\.roles\)/g)||[]).length!==2||/SELECT role_name FROM pg_catalog\.unnest\(p\.roles\)/.test(sql))errors.push('catalog policy roles are not converted element-by-element to text');
 if(!/false AS apt_to_apply/.test(sql)||!/0::integer AS b1_c1_ready_count/.test(sql)||!/29::integer AS unresolved_operation_count/.test(sql))errors.push('audit must remain fail-closed with 29 unresolved operations');
 if(!sql.includes("221d334d3db5913257ac610efba163a9"))errors.push('policy fingerprint missing');
 return {errors,tableCount:tables.length,cellCount:tables.length*OPERATIONS.length,statementCount:statements(sql).length};
}
function main(){const r=validateB1Audit();if(r.errors.length){for(const e of r.errors)process.stderr.write(`ERROR ${e}\n`);process.exitCode=1}else process.stdout.write(`PASS tables=${r.tableCount} cells=${r.cellCount} statements=${r.statementCount}\n`)}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
