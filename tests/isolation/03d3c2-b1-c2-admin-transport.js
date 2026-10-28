// Explicit PostgREST adapter. No I/O occurs until a method is invoked.
import { B1C2_TABLES } from './03d3c2-b1-c2-admin-contract.js';
export function createB1C2AdminTransport(config,{fetchImpl=globalThis.fetch}={}){
 const call=async(path,method='GET',body)=>{const r=await fetchImpl(`${config.url}/rest/v1/${path}`,{method,redirect:'error',headers:{apikey:config.key,Authorization:`Bearer ${config.key}`,'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});let data=null;try{data=await r.json()}catch{}return{ok:r.ok,status:r.status,data}};
 const select=(table,query)=>{if(!B1C2_TABLES.includes(table))throw new Error('forbidden_table');return call(`${table}?${query}`)};
 return Object.freeze({
  selectContext:async(userId,unitId)=>({unit:await call(`unidades?id=eq.${encodeURIComponent(unitId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,user_id`)}),
  discover:(table,markerPrefix)=>{const columns={planeacion_batches:'id,user_id,titulo',examenes:'id,user_id,unidad_id,batch_id,titulo,generation_job_id',examen_generation_jobs:'id,user_id,titulo,examen_id',examen_generation_items:'id,user_id,job_id,tema'};return select(table,`${table==='examen_generation_items'?'tema':'titulo'}=like.${encodeURIComponent(markerPrefix+'*')}&select=${columns[table]}`)},
  insertBatch:row=>call('planeacion_batches','POST',{id:row.id,user_id:row.owner,titulo:row.marker,plantel_id:null,grado_id:null,materia_id:null,unidad_id:null}),
  insertExam:row=>call('examenes','POST',{id:row.id,user_id:row.owner,unidad_id:row.unitId,batch_id:row.batchId,titulo:row.marker,tipos_pregunta:[],total_preguntas:0,contexto_temas:[],examen_ia:[],status:'generado',validation_errors:[]}),
  deleteJob:(id,owner)=>call(`examen_generation_jobs?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(owner)}`,'DELETE'),
  select
 })
}
