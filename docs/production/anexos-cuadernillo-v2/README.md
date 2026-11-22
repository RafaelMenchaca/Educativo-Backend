# Paquete productivo: tipo de cuadernillo v2 en Anexos

Estado: **preparado y no ejecutado**.

Destino exclusivo:

```text
Proyecto: Educativo IA produccion
Project ref: bfnkaqmhcsyxdxoqnahk
```

Destino expresamente prohibido:

```text
Proyecto: educativo-backend-test
Project ref: gwdtlbisykzzplgzczzq
```

Antes de ejecutar cualquier archivo, confirmar visualmente el project ref en
Supabase Dashboard. Si aparece `gwdtlbisykzzplgzczzq` o cualquier ref distinta
de `bfnkaqmhcsyxdxoqnahk`, detenerse. PostgreSQL no ofrece una fuente catalogal
confiable para comprobar el project ref: los SQL validan el fingerprint
estructural de `public.anexos`, pero esa comprobacion no sustituye la identidad
visual del proyecto.

## Flujo obligatorio

1. Confirmar visualmente `bfnkaqmhcsyxdxoqnahk`.
2. Ejecutar `01_preflight.sql`.
3. Guardar el veredicto, metadata catalogal y conteos agregados.
4. Detenerse para revision humana.
5. Con autorizacion separada, ejecutar `02_migration.sql` una vez.
6. Ejecutar exactamente el mismo `02_migration.sql` una segunda vez para
   comprobar idempotencia.
7. Ejecutar `03_postmigration.sql`.
8. Comparar manualmente `total_anexos` y la metadata de todas las columnas con
   la evidencia del preflight; revisar además las invariantes automáticas.
9. Detenerse para revision humana.
10. Conservar `04_rollback.sql` sin ejecutarlo.
11. Solo despues continuar con push, PR, merge y deploy si cada accion recibe
    su autorizacion correspondiente.

Cada archivo se ejecuta por separado. No seleccionar el directorio completo ni
improvisar SQL en el editor.

## Archivos

- `01_preflight.sql`: read-only y fail-closed. Comprueba tabla, columna
  opcional, CHECK, PK, UNIQUE, FKs, indices, RLS, policies, trigger y grants.
  Debe terminar con `PREFLIGHT PRODUCCION PASS`.
- `02_migration.sql`: unica etapa mutante. Dentro de una transaccion agrega la
  columna nullable y el CHECK canonico; no cambia filas ni otros objetos.
- `03_postmigration.sql`: read-only y fail-closed. Exige historicos con tipo
  `NULL`, comprueba invariantes y termina con
  `POSTMIGRATION PRODUCCION PASS`. Como los archivos no comparten estado, el
  total de filas se compara humanamente con la evidencia del preflight.
- `04_rollback.sql`: contingencia destructiva de schema. No es parte del flujo
  normal y requiere autorizacion expresa separada. Aborta ante cualquier dato
  v2 y solo elimina el CHECK y la columna.

## Condiciones de detencion

Detenerse si:

- el project ref visual no es exactamente `bfnkaqmhcsyxdxoqnahk`;
- aparece el project ref test;
- falta el veredicto PASS esperado;
- cualquier archivo produce warning o error;
- la primera o segunda migracion falla;
- los conteos preflight/postmigration no coinciden;
- existe cualquier anexo con tipo no `NULL` inmediatamente despues de migrar;
- cambian PK, UNIQUE, FKs, indices, RLS, policies, trigger o grants;
- se solicita ejecutar rollback sin una autorizacion nueva y expresa.

## Evidencia segura

Se puede compartir unicamente:

- project ref confirmado visualmente;
- veredictos;
- conteos agregados;
- metadata catalogal de columnas, constraints, indices, RLS, policies,
  triggers y grants;
- resultado de la primera y segunda ejecucion.

No mostrar filas, titulos, temas, contenido pedagogico, IDs de usuario, correos,
tokens, claves, contrasenas, connection strings ni headers de autorizacion.

## Registro operativo

- [ ] Project ref productivo confirmado visualmente.
- [ ] Preflight PASS y evidencia guardada.
- [ ] Revision humana posterior al preflight.
- [ ] Primera migracion PASS.
- [ ] Segunda migracion idempotente PASS.
- [ ] Postmigration PASS.
- [ ] Conteos comparados manualmente.
- [ ] Revision humana posterior al postmigration.
- [ ] Rollback conservado sin ejecutar.

Preparar este paquete no autoriza su ejecucion ni acredita que produccion haya
sido consultada o migrada.
