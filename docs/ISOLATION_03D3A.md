# 03D3A - garantias de propietario comun

Estado: **MIGRACION APLICADA Y POST-VERIFICADA EN SUPABASE TEST; REPETICION DE HARNESSES COMPLETADA EN 03D3B**. Produccion permanece intacta. Biblioteca continua como unico flujo visual principal y la jerarquia permanece congelada.

## Mecanismo

La proteccion usa nueve foreign keys compuestas (referencia, user_id) -> (parent.id, parent.user_id). Se conservan las FK simples historicas. Cuatro UNIQUE (id,user_id) habilitan los targets y un CHECK protege el unico child con owner nullable: planeaciones.batch_id IS NULL OR planeaciones.user_id IS NOT NULL.

No se crearon funciones, triggers, grants, policies ni SQL dinamico. Las nueve FK declaran MATCH SIMPLE ON UPDATE NO ACTION. Cuatro relaciones obligatorias conservan ON DELETE CASCADE. Cinco opcionales usan exclusivamente ON DELETE SET NULL (columna_relacional) y nunca modifican user_id.

## Relaciones

| relacion | nulabilidad | FK historica | nueva accion |
| --- | --- | --- | --- |
| planeaciones.batch_id -> planeacion_batches.id | ambas columnas child nullable | SET NULL | SET NULL (batch_id) |
| anexos.planeacion_id -> planeaciones.id | relacion y owner NOT NULL | CASCADE | CASCADE |
| anexos.batch_id -> planeacion_batches.id | relacion nullable; owner NOT NULL | no existe | SET NULL (batch_id) |
| listas_cotejo.planeacion_id -> planeaciones.id | relacion y owner NOT NULL | CASCADE | CASCADE |
| listas_cotejo.batch_id -> planeacion_batches.id | relacion nullable; owner NOT NULL | SET NULL | SET NULL (batch_id) |
| examenes.unidad_id -> unidades.id | relacion y owner NOT NULL | CASCADE | CASCADE |
| examenes.batch_id -> planeacion_batches.id | relacion nullable; owner NOT NULL | SET NULL | SET NULL (batch_id) |
| examen_generation_items.job_id -> examen_generation_jobs.id | relacion y owner NOT NULL | CASCADE | CASCADE |
| examenes.generation_job_id -> examen_generation_jobs.id | relacion nullable; owner NOT NULL | SET NULL | SET NULL (generation_job_id) |

Parents: planeacion_batches.user_id, unidades.user_id y examen_generation_jobs.user_id son NOT NULL; planeaciones.user_id es nullable. El preflight bloquea referencias a planeaciones sin owner. No se encontro un flujo legitimo con owners diferentes.

Las FK simples y compuestas coexistentes tienen iguales acciones DELETE y UPDATE. No dependen del orden de triggers referenciales. anexos.batch_id no tenia FK: la nueva constraint agrega existencia, owner comun y SET NULL. Biblioteca elimina children antes del batch; la nueva accion evita una referencia colgante en otros deletes autorizados.

## Paquete

- [Preflight](test-environment/03d3a_owner_integrity_preflight.sql): nueve SELECT agregados. Exige cero mismatch, orphan, child owner null, parent owner null y parent key duplicates. optional_reference_count es informativo.
- [Migracion](test-environment/03d3a_owner_integrity_migration.sql): transaccion one-shot; 14 constraints; cero DML de aplicacion.
- [Postverify](test-environment/03d3a_owner_integrity_postverify.sql): compara tablas, columnas ordenadas, tipos, confmatchtype, confupdtype, confdeltype, confdelsetcols, validacion, UNIQUE y CHECK.
- [Rollback](test-environment/03d3a_owner_integrity_rollback.sql): no ejecutado. Elimina primero nueve FK child, despues el CHECK y finalmente cuatro UNIQUE parent; sin CASCADE.

## Evidencia live de 03D3B

Rafael confirmo ejecucion manual solo en Supabase test:

- preflight 9/9 con todos los conteos de bloqueo en cero;
- migracion completa en una sola transaccion, sin filas ni errores;
- 9/9 FK compuestas presentes, validadas y coincidentes;
- 4/4 UNIQUE y 1/1 CHECK presentes, validados y coincidentes;
- total 14/14 constraints correctas;
- cinco FK opcionales con SET NULL limitado a batch_id o generation_job_id;
- cuatro obligatorias con CASCADE;
- todas con MATCH SIMPLE y UPDATE NO ACTION;
- rollback no ejecutado;
- produccion intacta.

La primera ejecucion de la sentencia estructural del postverify fallo con PostgreSQL 42883: array_agg(a.attname...) produjo name[] y se comparaba con text[]. La consulta corregida y el archivo versionado usan array_agg(a.attname::text ORDER BY k.position) en child_cols, parent_cols y delete_cols. La repeticion verifico 14/14.

## Clasificacion de harnesses posteriores

Los 19 caseIds relacionales de 03D2A/B/C tienen una unica constraint esperada. Un rechazo solo es PASS cuando:

1. code es 23503;
2. se extrae exactamente la constraint esperada para ese caseId;
3. no hay una segunda coincidencia reconocible;
4. child, owner, relacion, marcador, campos funcionales y padre ajeno permanecen intactos;
5. ledger y cleanup son coherentes.

Una FK historica, constraint distinta, nombre parcial, nombre desconocido, 23503 sin nombre, 23505 o 23514 producen INCONCLUSIVE. 42501 solo puede aprobar con before/after limpio. Los diagnostics nunca incluyen message, details, hint ni cuerpo raw.

Las simulaciones offline terminan 42/42 PASS en 03D2A, 72/72 PASS en 03D2B y 26/26 PASS en 03D2C cuando se devuelve la constraint exacta. Cleanup y recovery mantienen ledgers vacios.

## Estado

03D3B quedo completada: [el cierre live](ISOLATION_03D3B.md) registra 140 PASS, cero FAIL/INCONCLUSIVE, tres cleanups completos y cero residuos conocidos. Los 19 intentos relacionales fueron rechazados por su constraint exacta. Produccion permanece pendiente y Fase 03 continua abierta.
