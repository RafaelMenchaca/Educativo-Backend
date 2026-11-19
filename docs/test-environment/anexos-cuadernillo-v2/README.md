# Paquete SQL: tipo de cuadernillo v2 en Anexos

Este paquete prepara `public.anexos.tipo_cuadernillo` exclusivamente en el
proyecto autorizado de pruebas:

```text
Proyecto: educativo-backend-test
Project ref: gwdtlbisykzzplgzczzq
```

Producción está prohibida:

```text
Proyecto: educativo-backend
Project ref: bfnkaqmhcsyxdxoqnahk
```

Antes de cada ejecución se debe comprobar visualmente el project ref en el
Dashboard de Supabase. Ningún archivo contiene ni requiere que se comparta una
clave, token, contraseña o connection string.

## Orden operativo obligatorio

1. Ejecutar `01_preflight.sql`.
2. Conservar sus conteos y metadata y revisarlos con ChatGPT.
3. Con autorización de ChatGPT, ejecutar `02_migration.sql` una vez.
4. Ejecutar `02_migration.sql` una segunda vez para probar idempotencia.
5. Ejecutar `03_postmigration.sql`.
6. Conservar sus conteos y metadata y revisarlos con ChatGPT.
7. Conservar `04_rollback.sql` sin ejecutarlo.

Cada etapa se ejecuta por separado en el SQL Editor. No se debe seleccionar y
ejecutar el directorio completo como un único script.

## Archivos

### `01_preflight.sql`

Es read-only. Comprueba tabla, columnas, `contenido`, estado opcional de la
columna nueva, CHECK, UNIQUE, RLS y policies. Termina mostrando únicamente
conteos y metadata segura: columnas, constraints, índices, RLS, policies,
triggers y grants. El resultado esperado es `PREFLIGHT PASS`.

Detenerse ante cualquier excepción, ante un project ref distinto o si el
veredicto no aparece.

### `02_migration.sql`

Es la única etapa que agrega objetos. Dentro de una transacción agrega la
columna nullable y el CHECK canónico. No contiene backfill, cambios de filas,
índices, policies, RLS, grants, FKs o triggers. Debe completar correctamente dos
veces consecutivas.

Detenerse y no improvisar correcciones en el SQL Editor si cualquiera de las
dos ejecuciones falla.

### `03_postmigration.sql`

Es read-only y fail-closed. Exige que todos los anexos permanezcan con tipo
`NULL`, comprueba la columna, el CHECK y las invariantes previas, y muestra
metadata segura. El resultado esperado es `POSTMIGRATION PASS`.

### `04_rollback.sql`

Es una contingencia, no una etapa rutinaria. Solo puede ejecutarse en test y con
autorización expresa. Falla si encuentra un tipo no nulo, `schema_version = 2`
o una estructura `secciones`. No elimina ni modifica filas y no usa `CASCADE`.

## Registro seguro de evidencia

Registrar únicamente:

- project ref confirmado visualmente;
- veredicto de cada archivo;
- conteos agregados;
- definiciones catalogales de columnas, constraints, índices, RLS, policies,
  triggers y grants;
- éxito o error de la primera y segunda ejecución de la migración.

No copiar filas, títulos, temas, contenido pedagógico, IDs de usuario, correos,
tokens, claves, contraseñas ni encabezados de autorización.

La migración continúa preparada y pendiente de aplicación en test hasta que el
preflight, ambas ejecuciones y el postmigration hayan sido revisados y aprobados.
