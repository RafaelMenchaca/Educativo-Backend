# Paquete productivo: tipo de cuadernillo v2 en Anexos

Estado operativo aprobado: **preflight PASS, primera migracion PASS, segunda
ejecucion idempotente PASS y postmigration PASS**. El conteo se conservo en
`136` anexos: los `136` historicos permanecen con `tipo_cuadernillo IS NULL` y
no existe ningun tipo no nulo. Produccion ya contiene la columna nullable y un
unico CHECK canonico. Rollback no ejecutado.

El paquete se conserva como historial operativo, comprobacion idempotente y
recurso de contingencia. No debe volver a ejecutarse como paso rutinario de un
deploy. El codigo de Cuadernillos v2 continua pendiente de push, PR, merge y
deploy; actualizar el schema no implica que el flujo v2 ya este desplegado.

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

El siguiente flujo documenta la operacion ya completada y sigue siendo la guia
de referencia ante una revision autorizada; no constituye una instruccion para
repetirla durante despliegues rutinarios.

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
  Debe terminar con `PREFLIGHT PRODUCCION PASS`. Supabase SQL Editor muestra
  como resultado visible el ultimo `SELECT`, por lo que este archivo concentra
  el veredicto, conteos y fingerprint catalogal completo en una unica fila. Esa
  fila debe guardarse completa para compararla con `03_postmigration.sql`.
- `02_migration.sql`: unica etapa mutante. Dentro de una transaccion agrega la
  columna nullable y el CHECK canonico; no cambia filas ni otros objetos.
- `03_postmigration.sql`: read-only y fail-closed. Exige historicos con tipo
  `NULL`, comprueba invariantes y termina con
  `POSTMIGRATION PRODUCCION PASS`. Supabase SQL Editor muestra el ultimo
  `SELECT`, por lo que el archivo concentra veredicto, conteos y fingerprint
  catalogal en una sola fila que debe guardarse completa. Como los archivos no
  comparten estado, esa fila se compara humanamente con la del preflight.
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

- [x] Project ref productivo confirmado visualmente.
- [x] Preflight PASS y evidencia guardada.
- [x] Revision humana posterior al preflight.
- [x] Primera migracion PASS.
- [x] Segunda migracion idempotente PASS.
- [x] Postmigration PASS.
- [x] Conteos comparados manualmente: `136` antes y `136` despues; todos con
  tipo `NULL`.
- [x] Revision humana posterior al postmigration.
- [x] Rollback conservado sin ejecutar.

Este registro no autoriza pasos adicionales ni acredita un deploy. Push, PR,
merge y deploy requieren sus autorizaciones correspondientes. El rollback solo
puede ejecutarse con autorizacion expresa separada y con todas sus guardas
satisfechas.
