# Procedencia local de metadatos - 02C

CSV aportados por el usuario; PostgreSQL 15.8 comunicado. No se incorporan los CSV al repositorio. SHA-256 identifica los archivos revisados, no certifica integridad/completitud del export ni estado remoto actual.

## Evidencia complementaria pegada por el usuario

El usuario ejecutó la consulta acotada `docs/diagnostics/identity_sequence_metadata_readonly.sql` en el Supabase actual y comunicó el resultado para `public.planeaciones.id`: identity kind `d` (BY DEFAULT), secuencia `public.planeaciones_id_seq`, propietario `postgres`, tipo `bigint`, START 1, INCREMENT 1, MINVALUE 1, MAXVALUE 9223372036854775807, CACHE 1, CYCLE false y dependencia `i`. Esta evidencia no llegó como archivo: no se inventa nombre, hash ni verificación remota. No incluyó ni se solicita `last_value`.

## Destino y preflight comunicados — 02C.1

Producción queda identificada como `educativo-backend` / `bfnkaqmhcsyxdxoqnahk` / `us-east-2` / PostgreSQL 15.8 y está excluida de la inicialización. El destino manual autorizado es `educativo-backend-test` / `gwdtlbisykzzplgzczzq` / `us-east-2` / PostgreSQL 17.6 (`170006`). El usuario comunicó que es separado y vacío.

El preflight ejecutado por el usuario en el SQL Editor de pruebas devolvió `current_user=postgres` y cero para relaciones/secuencias public, funciones public no pertenecientes a extensiones, triggers personalizados de auth.users y policies de storage.objects. Confirmó `auth.users`, `storage.objects`, `auth.uid()`, `storage.foldername(text)`, `gen_random_uuid()` y RLS en storage.objects. Esta evidencia fue pegada en conversación: no tiene archivo/hash local y no fue verificada remotamente por el agente. No implica que la inicialización se haya ejecutado.

Expectativas que [verify_initialization_readonly.sql](verify_initialization_readonly.sql) compara después de una futura ejecución autorizada:

| Métrica | Esperado |
| --- | ---: |
| Tablas public | 19 |
| Relaciones/secuencias public | 20 |
| Columnas public | 257 |
| Constraints public | 76 |
| Foreign keys public | 41 |
| Índices public | 69 |
| Funciones public propias | 6 |
| Triggers personalizados public + auth.users | 16 |
| Tablas public con RLS | 19 |
| Policies public | 49 |
| Policies storage.objects | 8 |
| Policies totales del alcance | 57 |

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
