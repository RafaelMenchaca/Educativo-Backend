import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const DEFAULT_SQL_PATH = fileURLToPath(new URL('../docs/test-environment/03d1_metadata_audit.sql', import.meta.url));
const APP_TABLES = ['ai_generation_calls','ai_generation_jobs','ai_model_prices','anexos','examen_generation_items','examen_generation_jobs','examenes','grados','listas_cotejo','materias','planeacion_batches','planeaciones','planteles','profiles','temas','unidades','user_profiles','user_settings'].map(name => `public.${name}`);

export const SQL_MANIFEST = [
  { id:1, block:'00', result:'metadata', maxRows:1, sources:[] },
  { id:2, block:'01', result:'metadata', maxRows:19, sources:['relevant_tables','pg_namespace','pg_class'] },
  { id:3, block:'01', result:'metadata', maxRows:257, sources:['pg_class','pg_namespace','relevant_tables','pg_attribute','pg_attrdef'] },
  { id:4, block:'02', result:'metadata', maxRows:49, sources:['pg_policies','relevant_tables'] },
  { id:5, block:'03', result:'metadata', maxRows:532, sources:['pg_class','pg_namespace','relevant_tables','table_acl','aclexplode'] },
  { id:6, block:'03', result:'metadata', maxRows:12, sources:['pg_class','pg_namespace','aclexplode'] },
  { id:7, block:'03', result:'metadata', maxRows:24, sources:['pg_proc','pg_namespace','expected_functions','aclexplode'] },
  { id:8, block:'03', result:'metadata', maxRows:399, sources:['pg_class','pg_namespace','relevant_tables','roles','privileges'] },
  { id:9, block:'03', result:'metadata', maxRows:27, sources:['pg_class','pg_namespace','roles','sequence_privileges','pg_proc','expected_functions'] },
  { id:10, block:'04', result:'metadata', maxRows:76, sources:['pg_constraint','pg_class','pg_namespace','relevant_tables','unnest','pg_attribute'] },
  { id:11, block:'05', result:'metadata', maxRows:16, sources:['pg_trigger','pg_class','pg_namespace','pg_proc','relevant_tables'] },
  { id:12, block:'05', result:'metadata', maxRows:6, sources:['pg_proc','pg_namespace','pg_language','expected_functions','unnest'] },
  { id:13, block:'06', result:'metadata', maxRows:69, sources:['pg_index','pg_class','pg_namespace','relevant_tables'] },
  { id:14, block:'07', result:'aggregate', maxRows:18, sources:APP_TABLES },
  { id:15, block:'07', result:'aggregate', maxRows:16, sources:['public.ai_generation_jobs','public.examen_generation_jobs','public.examen_generation_items'] },
  { id:16, block:'07', result:'aggregate', maxRows:5, sources:['public.examen_generation_jobs','public.examen_generation_items','public.examenes'] },
  { id:17, block:'08', result:'aggregate', maxRows:37, sources:APP_TABLES.filter(name => !/\.(ai_model_prices|profiles|user_profiles|user_settings)$/.test(name)) }
];

const PROHIBITED_WORDS = new Set(['insert','update','delete','merge','truncate','alter','create','drop','grant','revoke','do','call','copy','commit','rollback','savepoint','vacuum','analyze','cluster','reindex','refresh','discard','reset']);
const ALLOWED_FUNCTIONS = new Set(['acldefault','aclexplode','array','cardinality','coalesce','count','current_database','current_setting','filter','format_type','has_function_privilege','has_sequence_privilege','has_table_privilege','md5','pg_get_constraintdef','pg_get_expr','pg_get_function_identity_arguments','pg_get_indexdef','pg_get_userbyid','unnest','version']);
const NON_FUNCTION_CALLS = new Set(['and','as','config','exists','in','k','or','relevant_tables','roles','privileges','sequence_privileges','expected_functions','values','when']);
const PROHIBITED_SCHEMAS = new Set(['auth','storage','vault','net','http','dblink','postgres_fdw']);

function normalizeIdentifier(value) {
  return value.split('.').map(part => part.trim().replace(/^"|"$/g, '').replace(/""/g, '"').toLowerCase()).join('.');
}

export function scanSql(source) {
  let clean=''; let i=0; let state='code'; let blockDepth=0; let dollarTag='';
  while (i < source.length) {
    const pair=source.slice(i,i+2);
    if (state==='code' && pair==='--') { state='line-comment'; clean+='  '; i+=2; continue; }
    if (state==='line-comment') { if (source[i]==='\n') { state='code'; clean+='\n'; } else clean+=' '; i++; continue; }
    if (state==='code' && pair==='/*') { state='block-comment'; blockDepth=1; clean+='  '; i+=2; continue; }
    if (state==='block-comment') {
      if (pair==='/*') { blockDepth++; clean+='  '; i+=2; continue; }
      if (pair==='*/') { blockDepth--; clean+='  '; i+=2; if (!blockDepth) state='code'; continue; }
      clean+=source[i]==='\n'?'\n':' '; i++; continue;
    }
    if (state==='code' && source[i]==="'") { state='single'; clean+=' '; i++; continue; }
    if (state==='single') {
      if (source[i]==="'" && source[i+1]==="'") { clean+='  '; i+=2; }
      else if (source[i]==="'") { state='code'; clean+=' '; i++; }
      else { clean+=source[i]==='\n'?'\n':' '; i++; }
      continue;
    }
    if (state==='code' && source[i]==='"') {
      let identifier=''; let closed=false; i++;
      while (i < source.length) {
        if (source[i]==='"' && source[i+1]==='"') { identifier+='"'; i+=2; continue; }
        if (source[i]==='"') { closed=true; i++; break; }
        identifier+=source[i++];
      }
      if (!closed) throw new Error('SQL incompleto: double-identifier');
      clean+=identifier.toLowerCase(); continue;
    }
    if (state==='code' && source[i]==='$') {
      const match=source.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) { dollarTag=match[0]; state='dollar'; clean+=' '.repeat(dollarTag.length); i+=dollarTag.length; continue; }
    }
    if (state==='dollar') {
      if (source.startsWith(dollarTag,i)) { clean+=' '.repeat(dollarTag.length); i+=dollarTag.length; state='code'; }
      else { clean+=source[i]==='\n'?'\n':' '; i++; }
      continue;
    }
    clean+=source[i++];
  }
  if (!['code','line-comment'].includes(state)) throw new Error(`SQL incompleto: ${state}`);
  return clean;
}

const splitStatements = clean => clean.split(';').map(value => value.trim()).filter(Boolean);
function extractSources(statement) {
  const values=[];
  for (const match of statement.matchAll(/(?<!distinct )\b(?:from|join)\s+(?:lateral\s+)?((?:[a-z_][a-z0-9_$]*)(?:\s*\.\s*[a-z_][a-z0-9_$]*)?)/gi)) values.push(normalizeIdentifier(match[1].replace(/\s+/g,'')));
  return values;
}
function extractFunctions(statement) {
  const values=[];
  for (const match of statement.matchAll(/\b((?:[a-z_][a-z0-9_$]*)(?:\s*\.\s*[a-z_][a-z0-9_$]*)?)\s*\(/gi)) values.push(normalizeIdentifier(match[1].replace(/\s+/g,'')));
  return values;
}
function manifestMarkers(source) {
  return [...source.matchAll(/^-- AUDIT_STATEMENT (\d{2}) \| block=(\d{2}) \| result=(metadata|aggregate) \| max_rows=(\d+)\s*$/gm)].map(match => ({id:Number(match[1]),block:match[2],result:match[3],maxRows:Number(match[4])}));
}

function hasCommaSeparatedSource(statement) {
  let depth=0; const fromDepths=[]; let i=0;
  while (i < statement.length) {
    const char=statement[i];
    if (char==='(') { depth++; i++; continue; }
    if (char===')') { fromDepths.splice(0,fromDepths.length,...fromDepths.filter(value => value < depth)); depth--; i++; continue; }
    if (char===',' && fromDepths.includes(depth)) return true;
    if (/[a-z_]/i.test(char)) {
      const match=statement.slice(i).match(/^[a-z_][a-z0-9_$]*/i); const word=match[0].toLowerCase(); i+=match[0].length;
      if (word==='from') fromDepths.push(depth);
      else if (['join','where','group','order','union','limit','offset'].includes(word)) {
        for (let index=fromDepths.length-1;index>=0;index--) if (fromDepths[index]===depth) fromDepths.splice(index,1);
      }
      continue;
    }
    i++;
  }
  return false;
}

export function validateMetadataSql(source) {
  const errors=[]; let clean;
  try { clean=scanSql(source); } catch (error) { return {errors:[error.message],statementCount:0,markers:[]}; }
  const statements=splitStatements(clean); const markers=manifestMarkers(source);
  if (statements.length!==SQL_MANIFEST.length) errors.push(`Conteo de sentencias: esperado ${SQL_MANIFEST.length}, recibido ${statements.length}.`);
  if (markers.length!==SQL_MANIFEST.length) errors.push(`Conteo de marcadores: esperado ${SQL_MANIFEST.length}, recibido ${markers.length}.`);
  SQL_MANIFEST.forEach((expected,index) => {
    const marker=markers[index];
    if (!marker || marker.id!==expected.id || marker.block!==expected.block || marker.result!==expected.result || marker.maxRows!==expected.maxRows) errors.push(`Manifiesto SQL no coincide en sentencia ${expected.id}.`);
  });
  statements.forEach((statement,index) => {
    const manifest=SQL_MANIFEST[index]; const first=statement.match(/^[a-z_]+/i)?.[0]?.toLowerCase();
    if (!['select','with'].includes(first)) errors.push(`Sentencia ${index+1} no inicia con SELECT/CTE.`);
    for (const token of statement.toLowerCase().matchAll(/\b[a-z_]+\b/g)) if (PROHIBITED_WORDS.has(token[0])) errors.push(`Sentencia ${index+1} contiene ${token[0].toUpperCase()}.`);
    if (/\bselect\b[\s\S]*?\binto\b/i.test(statement)) errors.push(`Sentencia ${index+1} contiene SELECT INTO.`);
    if (/\b(?:lock\s+table|for\s+(?:update|no\s+key\s+update|share|key\s+share))\b/i.test(statement)) errors.push(`Sentencia ${index+1} contiene un lock explícito.`);
    if (/^\s*(?:set|reset|discard)\b/i.test(statement) || /\bset\s+(?:role|session|local)\b/i.test(statement)) errors.push(`Sentencia ${index+1} cambia sesión o rol.`);
    for (const called of extractFunctions(statement)) {
      const parts=called.split('.'); const base=parts.at(-1); const schema=parts.length>1?parts[0]:null;
      if ((schema && (schema !== 'pg_catalog' || PROHIBITED_SCHEMAS.has(schema) || !ALLOWED_FUNCTIONS.has(base))) || (!schema && !NON_FUNCTION_CALLS.has(base) && !ALLOWED_FUNCTIONS.has(base))) errors.push(`Sentencia ${index+1} invoca función no permitida: ${called}.`);
    }
    if (manifest) {
      const allowed=new Set(manifest.sources);
      for (const sourceName of extractSources(statement)) if (!allowed.has(sourceName)) errors.push(`Sentencia ${index+1} usa fuente no autorizada: ${sourceName}.`);
      if (manifest.result==='aggregate' && !/\bcount\s*\(/i.test(statement)) errors.push(`Sentencia ${index+1} no contiene COUNT.`);
    }
    if (/\bselect\s+\*/i.test(statement)) errors.push(`Sentencia ${index+1} usa SELECT *.`);
    if (hasCommaSeparatedSource(statement)) errors.push(`Sentencia ${index+1} usa fuentes separadas por coma; use JOIN explícito.`);
  });
  if (/\bpg_get_functiondef\s*\(/i.test(clean)) errors.push('No se permite devolver cuerpos de funciones.');
  if (/\b(?:from|join)\s+public\s*\.\s*ia_metrics_legacy\b/i.test(clean)) errors.push('ia_metrics_legacy solo puede auditarse mediante catálogos.');
  const remainingSettings=source.replace(/current_setting\s*\(\s*'server_version'\s*\)/gi,'');
  if (/\bcurrent_setting\s*\(/i.test(remainingSettings)) errors.push('Solo se permite current_setting(server_version).');
  if (/\$\{|(?<!:):[A-Za-z_]\w*|\\set\b/i.test(clean)) errors.push('No se permiten variables o comandos de cliente.');
  return {errors:[...new Set(errors)],statementCount:statements.length,markers};
}

export async function validateFile(path=DEFAULT_SQL_PATH) {
  const source=await readFile(path,'utf8'); const result=validateMetadataSql(source);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  try { const result=await validateFile(process.argv[2]||DEFAULT_SQL_PATH); console.log(`03D1 SQL read-only: PASS (${result.statementCount} sentencias; manifiesto exacto).`); }
  catch { console.error('03D1 SQL read-only: FAIL.'); process.exitCode=1; }
}
