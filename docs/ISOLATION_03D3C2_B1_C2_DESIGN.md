# 03D3C2-B1-C2 - ciclo reversible de fixtures

Fecha: 2026-10-27. Estado: **diseno offline; no implementado y no apto para revocar grants**. El commit base de B1 es `cb4d01bad40fc92a555a7c352afeab4ba3c621c8` (`docs(security): audit authenticated DML privileges`). B0-current permanece completado en Supabase test; produccion esta intacta.

## Resultado ejecutivo

La segunda lectura de codigo no encontro consumidor authenticated productivo para ninguna de las ocho operaciones. Jobs/items y persistencia final de examenes usan admin/worker; los batches productivos se crean con `supabaseAdmin`; no existe UPDATE funcional de temas. Los grants se conservan temporalmente porque los harnesses actuales los usan para prepare, casos positivos, restauracion o cleanup.

La recomendacion es hibrida: primero implementar y validar un fixture runner/recovery administrativo **local, separado, exclusivo de test y ausente del runtime**; despues adaptar los casos authenticated para esperar denegacion exacta; finalmente revocar por tres olas. No se entrega autoridad elevada a los harnesses A/B.

## Ocho operaciones y casos dependientes

| Tabla / operacion | Uso actual | CaseIds principales | Si se revoca hoy | Sustitucion minima |
|---|---|---|---|---|
| items UPDATE | execute/restauracion | ITEM EDIT CROSS/OWNER/JOB-CROSS | dejan de alcanzar row/constraint | snapshot + denegacion exacta; sin restore si no hubo efecto |
| items DELETE | caso propio/cruzado/anon y cleanup | ITEM DELETE CROSS/ANON/OWN | copia y ledger pendientes | borrar job cerrado mediante autoridad test; CASCADE items |
| jobs DELETE | caso propio/cruzado/anon y cleanup | EJOB DELETE CROSS/ANON/OWN | jobs/targets pendientes | autoridad test borra solo jobs marcados tras validar grafo |
| examenes INSERT | prepare y ataques CREATE | 03D2B CREATE OWN/OWNER/ANON/REL/BATCH; 03D2C EXAM CREATE JOB | no hay bases ni ataques atribuibles | autoridad test prepara bases; usuario prueba denegacion |
| examenes UPDATE | own/cross/owner/anon/relaciones y restore | 03D2B EDIT; 03D2C EXAM EDIT JOB | ya no alcanza RLS/constraint | denegacion con before/after; evidencia historica se conserva |
| batches INSERT | prepare y CREATE | BATCH CREATE OWN A/B, OWNER, ANON | 03D2A/B no preparan grafo | autoridad test crea batches A/B exactos |
| batches UPDATE | cross/owner/anon y restore | BATCH EDIT CROSS/OWNER/ANON | rechazo por grant | denegacion exacta y snapshots |
| temas UPDATE | update propio/cross | 03D3C1 OWN TEMA UPDATE-A/UPDATE-CROSS-A | no prueba trigger runtime | conservar evidencia 03D3C1; acreditar grant denial |

El manifiesto completo esta en `tests/isolation/03d3c2-b1-c2-design.js`. No se eliminan caseIds: cambia la observacion esperada despues del revoke, pero se conserva actor, snapshot y trazabilidad. La evidencia previa de constraints/triggers no se reetiqueta como evidencia posterior al grant.

## Grafo y cascadas

| Child -> parent | Nullable | ON DELETE | Owner comun 03D3A | Consecuencia |
|---|---:|---|---:|---|
| planeaciones -> batches | si | SET NULL | si | borrar batch no limpia planeaciones |
| temas -> unidades | no | CASCADE | si | solo una unidad sintetica propia puede limpiar temas |
| planeaciones -> temas | si | SET NULL | si | borrar tema no limpia planeaciones |
| examenes -> unidades | no | CASCADE | si | prohibido borrar unidades externas de 03D2B/C |
| examenes -> batches | si | SET NULL | si | borrar batch no limpia examenes |
| items -> jobs | no | CASCADE | si | borrar job cerrado elimina items |
| examenes -> jobs | si | SET NULL | si | borrar job no elimina examen |

Prepare: referencias externas read-only verificadas, batches, jobs, items y examenes. Cleanup/recovery: examenes; jobs (CASCADE items); planeaciones/otros hijos del run; batches; arbol sintetico hijos->padres. Antes de borrar job, todos sus items deben pertenecer al run y los examenes del run deben estar ausentes o desacoplados. Un dependiente externo detiene el proceso. Las cascadas estan demostradas estructuralmente; usarlas como unico cleanup requiere prueba real reversible en test.

## Comparacion de opciones

| Opcion | Autoridad/superficie | Prepare / cleanup / recovery | Decision |
|---|---|---|---|
| A mantener hasta 03F | ninguna nueva; ocho grants runtime | completo hoy | solo temporal hasta tener reemplazo, no hasta fecha ciega |
| B SQL Editor manual | postgres humano; nada desplegado | posible pero propenso a error y recovery laboriosa | respaldo de emergencia |
| C runner admin local test-only | credencial oculta en memoria; fuera del runtime | completo con discovery/grafo | **recomendado**, con solo dos INSERT y un DELETE |
| D endpoint admin test | autoridad privilegiada HTTP | completo | rechazado: riesgo de despliegue accidental |
| E RPC de test | SECURITY DEFINER/ACL nueva | completo | rechazado: objeto y superficie DB nuevos |
| F rutas/cascadas productivas | usuario/API actual | parcial; job cascade ayuda | usar donde aplica, insuficiente sola |
| G dividir | combinacion | olas independientes | adoptado junto con C |

Todas son portables PG15/PG17 salvo que su implementacion futura introduzca SQL no comun. B y C son reversibles operacionalmente; C ofrece mejor auditabilidad. D/E aumentan superficie productizable. A no mejora minimo privilegio.

## Contrato futuro de autoridad test-only

No se implementa aqui. Autoridad minima propuesta:

- `INSERT` exacto en `planeacion_batches` y `examenes` para bases A/B verificadas;
- `DELETE` exacto en `examen_generation_jobs`; la FK limpia items;
- SELECT minimo para discovery, grafo y confirmacion;
- ningun UPDATE privilegiado: tras revoke, UPDATE de usuario se deniega y no requiere restore.

Guardas: `APP_ENV=test`; Project ID literal de test; URL fija; credencial solo por entrada oculta/memoria; cero persistencia/log; allowlist de tres mutaciones; marcador/runId exactos; owner esperado; cardinalidad maxima; discovery; grafo cerrado; ausencia final; uncertain fuera de cleanup automatico; recovery separado; importacion sin I/O; modulo ausente del runtime. No acepta IDs manuales, URL libre, production, service role en harnesses A/B ni cleanup best-effort.

## Olas y criterios de parada

1. **T1**: items UPDATE/DELETE, jobs DELETE, examenes INSERT/UPDATE. Probar job CASCADE, SET NULL de examen, runner/recovery y 03D2B/C.
2. **T2**: batches INSERT/UPDATE. Probar prepare externo, 03D2A/B y DELETE authenticated conservado.
3. **T3**: temas UPDATE. Conservar los 22 PASS historicos y adaptar solo los UPDATE.

Stop ante target no test, credencial persistida, fila sin marcador, owner/cardinalidad/grafo inesperados, escritura ambigua, dependiente externo, snapshot alterado, cleanup no verificable o perdida de cobertura A/B/anon.

## Estado

- B0-current: completado en test.
- B1: auditoria completada, sin revocaciones.
- B1-C2: diseno offline; implementacion/prueba pendientes.
- 03D3C2, 03D3C y Fase 03: abiertas; produccion intacta.
- CSV 03A: sin cambios.
