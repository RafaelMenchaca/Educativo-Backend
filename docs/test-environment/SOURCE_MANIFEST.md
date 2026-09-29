# Procedencia local de metadatos - 02C

CSV aportados por el usuario; PostgreSQL 15.8 comunicado. No se incorporan los CSV al repositorio. SHA-256 identifica los archivos revisados, no certifica integridad/completitud del export ni estado remoto actual.

## Evidencia complementaria pegada por el usuario

El usuario ejecutó la consulta acotada `docs/diagnostics/identity_sequence_metadata_readonly.sql` en el Supabase actual y comunicó el resultado para `public.planeaciones.id`: identity kind `d` (BY DEFAULT), secuencia `public.planeaciones_id_seq`, propietario `postgres`, tipo `bigint`, START 1, INCREMENT 1, MINVALUE 1, MAXVALUE 9223372036854775807, CACHE 1, CYCLE false y dependencia `i`. Esta evidencia no llegó como archivo: no se inventa nombre, hash ni verificación remota. No incluyó ni se solicita `last_value`.

## Destino y preflight comunicados — historial 02C.1

Producción queda identificada como `educativo-backend` / `bfnkaqmhcsyxdxoqnahk` / `us-east-2` / PostgreSQL 15.8 y está excluida de la inicialización. El destino manual autorizado es `educativo-backend-test` / `gwdtlbisykzzplgzczzq` / `us-east-2` / PostgreSQL 17.6 (`170006`). El usuario comunicó que es separado y vacío.

El preflight ejecutado por el usuario en el SQL Editor de pruebas devolvió `current_user=postgres` y cero para relaciones/secuencias public, funciones public no pertenecientes a extensiones, triggers personalizados de auth.users y policies de storage.objects. Confirmó `auth.users`, `storage.objects`, `auth.uid()`, `storage.foldername(text)`, `gen_random_uuid()` y RLS en storage.objects. Esta evidencia fue pegada en conversación: no tiene archivo/hash local y no fue verificada remotamente por el agente. No implica que la inicialización se haya ejecutado.

## Inicialización y postflight aprobados — evidencia manual 2026-09-28 (02C.2)

El usuario proporcionó los resultados desde Supabase SQL Editor de `educativo-backend-test` / `gwdtlbisykzzplgzczzq` / `us-east-2` / PostgreSQL 17.6. Confirmó que el preflight inmediatamente anterior devolvió los cuatro contadores en 0 y todas las dependencias/RLS indicadas arriba en true. Ejecutó `initialize_application.sql` **una sola vez**, con resultado `Success. No rows returned`, y después ejecutó [verify_initialization_readonly.sql](verify_initialization_readonly.sql) manualmente por bloques. El paquete corresponde al commit `3be7c40`.

Evidencia comunicada en conversación, sin archivo de resultados ni hash nuevo y sin comprobación remota del agente. Se registra el postflight como aprobado en su alcance catalogal. No se copiaron datos, usuarios ni objetos desde producción; producción `educativo-backend` / `bfnkaqmhcsyxdxoqnahk` no fue modificada. Esto no constituye validación funcional con usuarios, pruebas RLS A/B/anon ni aislamiento completo de ambientes.

| Métrica del postflight | Esperado | Observado | Estado |
| --- | ---: | ---: | --- |
| all_application_policies | 57 | 57 | OK |
| auth_user_creation_trigger | 1 | 1 | OK |
| custom_triggers_public_and_auth_users | 16 | 16 | OK |
| planeaciones_identity_sequence | 1 | 1 | OK |
| public_columns | 257 | 257 | OK |
| public_constraints | 76 | 76 | OK |
| public_foreign_keys | 41 | 41 | OK |
| public_indexes | 69 | 69 | OK |
| public_non_extension_functions | 6 | 6 | OK |
| public_policies | 49 | 49 | OK |
| public_relations_or_sequences | 20 | 20 | OK |
| public_tables | 19 | 19 | OK |
| public_tables_with_rls | 19 | 19 | OK |
| public_tables_without_rls | 0 | 0 | OK |
| storage_object_policies | 8 | 8 | OK |

Detalle adicional confirmado por el usuario:

- Las 19 tablas tienen `relrowsecurity=true` y `relforcerowsecurity=false`: ai_generation_calls, ai_generation_jobs, ai_model_prices, anexos, examen_generation_items, examen_generation_jobs, examenes, grados, ia_metrics_legacy, listas_cotejo, materias, planeacion_batches, planeaciones, planteles, profiles, temas, unidades, user_profiles y user_settings.
- Los 16 triggers tienen `enabled_mode=O`: los 15 públicos de actualización/propiedad del inicializador y `auth.users.on_auth_user_created` → `public.handle_new_user`.
- `public.planeaciones.id` conserva identity `d` (BY DEFAULT) y la secuencia `public.planeaciones_id_seq`, owner postgres, bigint, START 1, INCREMENT 1, MINVALUE 1, MAXVALUE 9223372036854775807, CACHE 1, CYCLE false y dependencia `i`. No se consultó ni modificó `last_value`.
- Las 41 FK tienen `validated=true` y acciones referenciales coincidentes con el inicializador. En particular, `planeaciones_user_id_fkey` → auth.users conserva **ON UPDATE NO ACTION / ON DELETE NO ACTION**; no se convierte a CASCADE.
- `auth.uid()`, `pg_catalog.gen_random_uuid()` y `storage.foldername(text)` están disponibles.

**No volver a ejecutar el inicializador sobre este proyecto.** El preflight de solo lectura permanece consultable, pero ahora debe incumplir intencionalmente las cuatro condiciones de cero: relaciones/secuencias public 20, funciones propias public 6, triggers auth.users 1 y policies storage.objects 8, según el postflight aportado. La consulta no lanza un error por esos valores; son las condiciones de aceptación y las guardias del inicializador las que rechazan el destino no vacío. El postflight permanece reutilizable para comparar metadatos.

## Archivos de metadatos de origen (sin cambios)

| Archivo | Filas | SHA-256 |
| --- | ---: | --- |
| bloque_01.csv | 257 | c0a759b4dea3fe7f59d0cc8de65762307a93cf2989cb0ff37514dae9955a5482 |
| bloque_02.csv | 76 | 8ea5ea686c05037511c9ffec9f73dd0be723938cfc3fdbe1a9c594e01413ae43 |
| bloque_03.csv | 69 | d86112f08cee73bb5556e8bc9e3fa282397713513941844bc13fb5fbc2f73045 |
| bloque_04.csv | 65 | e12c603ef91cd685d0295c9de6fc117de53e900e81d95c58604dc8315fb7366e |
| bloque_05.csv | 16 | da22fd4146192839c8b738f19724e0bafd4777f92066e35bfeb259bb6e304b33 |
| bloque_06.csv | 705 | d537fe92cfb20fee57bbdace58ffd2ce153861a6ff95b2a54ed3f694c6b87c17 |
| bloque_07.csv | 132 | 93866558773f05e609b20d88da01f79f55c5d4a8ae46fb32d636f4273c26246a |
| bloque_08.csv | 8 | 56286f4c4110e9dc35025f97bffb4699117f7d5bac1f7a3c1957800f2f43e000 |
| bloque_09.csv | 10 | f108e04d8ccaf05d6d229a0537668c6cc35a3155525429a4074eb08913e1797a |
| bloque_10.csv | 639 | 777138813f0f9483fb13de46b105dc97c8719bf55a2f1c82fb979e35baaabd64 |
| bloque_11.csv | 5 | 467bbbf3cd4502eb677fbaac786f5220bc3d4cccac5f55351942b3302258afd2 |
