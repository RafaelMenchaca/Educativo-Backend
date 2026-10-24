# 03D3C1 - validacion runtime de funciones trigger

Fecha: 2026-10-24.

Estado: **03D3C1 completada en Supabase test.** Ownership, aprovisionamiento Auth, los once consumidores de `set_updated_at` y cleanup quedaron aprobados. La promocion controlada a produccion permanece pendiente; 03D3C y Fase 03 siguen abiertas.

Clasificacion del paquete Auth: **EJECUTADO Y APROBADO EN SUPABASE TEST**. El procedimiento permanece documentado para trazabilidad y no autoriza ejecucion en produccion.

Biblioteca sigue siendo el unico flujo visual principal. Este plan usa la jerarquia congelada solo como grafo relacional minimo y desechable; no usa Explorer, rutas visuales, generacion, workers, Storage u OpenAI.

## Evidencia ya obtenida

Despues de 03D3C1, los harnesses existentes terminaron:

| Suite | Run sanitizado | Resultado |
| --- | --- | --- |
| 03D2A | `359da931-5bb4-47ab-bfca-f365c548816b` | 42 PASS; cleanup completo; exit 0 |
| 03D2B | `e7905730-e8d6-4eab-9d7f-a37025b56c41` | 72 PASS; cleanup completo; exit 0 |
| 03D2C | `63347d26-133c-47f6-8f53-3f81059fa331` | 26 PASS; cleanup completo; exit 0 |

Total previo al harness dirigido: 140 PASS, cero FAIL, cero INCONCLUSIVE y cero residuos conocidos. Esto prueba continuidad de las operaciones cubiertas; el run dirigido siguiente acredita los cuatro triggers de ownership. Ninguna de esas ejecuciones crea un usuario Auth.

El harness de ownership se ejecuto posteriormente con run sanitizado `63347d26-133c-47f6-8f53-3f81059fa331`: 22 PASS, cero FAIL, cero INCONCLUSIVE, cero commandErrors, prepare/execute/cleanup completos, ledgers vacios, exit 0 y cero residuos conocidos. Los ocho intentos cruzados fueron rechazados por `P0001` con su trigger exacto; los casos propios y los cinco `updated_at` jerarquicos pendientes pasaron. Recovery no fue necesario. Ownership queda completado.

## Contratos exactos

| Funcion | Trigger | Evento | Parent consultado | Regla | Evidencia actual |
| --- | --- | --- | --- | --- | --- |
| `enforce_grado_ownership()` | `grados.trg_grado_ownership` | BEFORE INSERT OR UPDATE | `planteles` | existe `id=NEW.plantel_id AND user_id=NEW.user_id` | PASS runtime propio/cruzado posterior al REVOKE |
| `enforce_materia_ownership()` | `materias.trg_materia_ownership` | BEFORE INSERT OR UPDATE | `grados` | existe `id=NEW.grado_id AND user_id=NEW.user_id` | PASS runtime propio/cruzado posterior al REVOKE |
| `enforce_tema_ownership()` | `temas.trg_tema_ownership` | BEFORE INSERT OR UPDATE | `unidades` | existe `id=NEW.unidad_id AND user_id=NEW.user_id` | PASS runtime propio/cruzado posterior al REVOKE |
| `enforce_planeacion_tema_ownership()` | `planeaciones.trg_planeacion_tema_ownership` | BEFORE INSERT OR UPDATE | `temas` | null permitido; si no, existe `id=NEW.tema_id AND user_id=NEW.user_id` | PASS runtime propio/cruzado posterior al REVOKE |
| `handle_new_user()` | `auth.users.on_auth_user_created` | AFTER INSERT | inserta en `profiles` y `user_settings` | profile id/email/full_name; settings `{}`; ON CONFLICT no-op | estructura 6/6 y binding 16/16; aprovisionamiento pendiente |

Las cuatro funciones de ownership son invoker y las escrituras normales usan authenticated mediante cliente de usuario. No existe necesidad legitima de service role para este harness. `handle_new_user` es definer y el alta/borrado de `auth.users` requiere autoridad administrativa Auth, separada del harness A/B.

## Harness de ownership ejecutado

El manifiesto machine-checkable esta en `tests/isolation/03d3c1-runtime-validation-plan.js`: 22 casos unicos, ocho INSERT propios A/B, cuatro UPDATE propios, cuatro INSERT cruzados, cuatro UPDATE cruzados y dos comprobaciones adicionales de `updated_at`.

### Fixtures

Cada actor crea exactamente un arbol propio del run:

```text
plantel -> grado -> materia -> unidad -> tema -> planeacion
```

Total maximo: doce filas confirmadas, dos por tabla. Todos los UUID se reservan antes del POST; los bigint de planeacion deben seguir el contrato canonico de hasta 15 digitos de 03D2A. El marcador exacto es:

```text
EIA-03D3C1-OWN:<runId>:<actor>:<tabla>:<rol>
```

Se almacena en `nombre`, `titulo` o `custom_title`. `grado.nivel_base` usa un valor permitido; las restantes columnas obligatorias usan valores sinteticos minimos. Antes de cada POST se exige preflight por ID como A y B con respuestas exitosas y vacias.

### Casos y criterio

- INSERT propio A/B para grado, materia, tema y planeacion debe crear exactamente la fila del actor.
- UPDATE propio A debe conservar owner/padre y avanzar coherentemente `updated_at`.
- INSERT/UPDATE A hacia el padre B debe ser rechazado por el trigger y dejar child/padre sin cambios.
- `P0001` solo puede aprobar el rechazo si el parent existe como B, el payload cumple FK/UNIQUE/CHECK y los snapshots confirman cero efecto.
- `23503`, `23505`, `23514`, `42501`, ausencia de codigo o respuesta ambigua son INCONCLUSIVE para la prueba del trigger.
- Un HTTP exitoso que persista la relacion es FAIL; se restaura/elimina solo si identidad, marcador y grafo siguen siendo exactos. El FAIL se conserva.

Cada mutacion negativa exige snapshot del child por A y del parent por B, intento, relectura por sus owners y comparacion estructural. No se imprimen mensajes de excepcion, nombres funcionales, tokens, UUID de usuarios ni cuerpos.

### Cleanup y recovery

Orden obligatorio: planeaciones, temas, unidades, materias, grados, planteles. Cada DELETE usa el token del owner y filtro `id + user_id`, queda `delete_unverified` hasta ausencia confirmada como A/B y es reintentable. No se borra una escritura uncertain automaticamente.

Recovery separado: descubre solo la gramatica exacta del run y una allowlist cerrada de seis roles por actor; maximo dos filas por tabla. Reconstruye el grafo completo, rechaza owner/marcador/cardinalidad/relacion inesperados y no elimina si existe un dependiente ajeno al run. No acepta IDs manuales.

El plan ya tiene runner y recovery independientes en `tests/isolation/03d3c1-ownership-*.js`, con launchers propios y entrada oculta. La revision offline conserva exactamente los 22 caseIds. Auth permanece fuera del harness.

Para mantener el limite de recovery de dos filas por tabla, `execute` realiza primero los UPDATE propios y cruzados. Despues procesa los INSERT cruzados de abajo hacia arriba: elimina de forma verificada el child A y reutiliza su ID reservado. Nunca coexiste una tercera fila de la tabla. Una aceptacion inesperada se registra FAIL y se elimina de inmediato; una respuesta ambigua permanece `UNCERTAIN` y detiene el avance.

El clasificador admite PASS por rechazo solo con `code=P0001`, un unico campo textual no vacio y el mensaje exacto correspondiente: `plantel_id`, `grado_id`, `unidad_id` o `tema_id no pertenece a este usuario`. Otro mensaje, texto parcial, detalle/hint adicional, `23503`, `23505`, `23514`, `42501` o falta de codigo es INCONCLUSIVE. La salida nunca conserva el texto fuente.

### Procedimiento manual pendiente

Solo despues de nueva autorizacion, desde backend:

```powershell
pwsh -NoProfile -File tests/isolation/start-03d3c1-ownership.ps1
```

Confirmar `educativo-backend-test`, confirmar que A/B son sinteticos, distintos y exclusivos, introducir en oculto public key/UUID/token A/B y ejecutar `prepare`, `execute`, `cleanup`, `quit`. Exit 0 requiere 22 PASS y ledgers vacios. Si una escritura queda ambigua, cerrar sin borrarla automaticamente y, con el mismo runId, usar:

```powershell
pwsh -NoProfile -File tests/isolation/start-03d3c1-ownership-recovery.ps1
```

Ejecutar `discover`, revisar el resumen sanitizado, luego `recover` y `quit`. Recovery no acepta IDs manuales, rechaza grafos abiertos y no toca filas sin el marcador exacto.

## Contrato Auth auditado

`auth.users` es un objeto gestionado por Supabase y su definicion completa no se versiona en este repositorio; por ello este paquete no inventaria sus defaults, CHECK o UNIQUE. El trigger solo consume `NEW.id`, `NEW.email` y `NEW.raw_user_meta_data`. El contrato local comprobable es:

| Objeto | Columnas/constraints versionados relevantes | Alta | Eliminacion |
| --- | --- | --- | --- |
| `public.profiles` | `id uuid` PK/FK NOT NULL; `full_name`, `email`, `avatar_url` nullable; timestamps NOT NULL con `now()` | `handle_new_user` inserta `NEW.id`, `NEW.email`, `coalesce(raw_user_meta_data->>'full_name','')` | `profiles_id_fkey` referencia `auth.users(id) ON DELETE CASCADE` |
| `public.user_settings` | `user_id uuid` PK/FK NOT NULL; `settings jsonb NOT NULL DEFAULT '{}'`; timestamps NOT NULL con `now()` | `handle_new_user` inserta `NEW.id` y `{}` | `user_settings_user_id_fkey` referencia `auth.users(id) ON DELETE CASCADE` |

No hay CHECK adicionales ni UNIQUE aparte de sus PK. Las policies permiten SELECT/INSERT/UPDATE propios y no DELETE directo. Los grants versionados son amplios, pero RLS limita el verificador a la sesion. `avatar_url` y `settings.eia_03d3c1_validation` son los unicos campos desechables actualizados; nunca se altera `id`, `user_id`, `email` o `full_name`.

La documentacion oficial distingue **Add user / Create user** de **Send invitation**: la invitacion envia correo, mientras que la creacion administrativa permite confirmar el email y no usa el flujo de invitacion. La creacion administrativa requiere autoridad confiable; esa autoridad permanece en el Dashboard, nunca en el script. Referencias: [Users](https://supabase.com/docs/guides/auth/users), [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser) y [User Management](https://supabase.com/docs/guides/auth/managing-user-data).

## Primera tentativa Auth: diagnostico local

La primera tentativa creo manualmente una identidad sintetica en Supabase test, pero el launcher fallo dentro de `validateAuthVerifierConfig()` antes de emitir `RUN`. No hubo login, token, `verify-create`, UPDATE ni escritura del verificador, por lo que no constituye evidencia runtime Auth. La causa exacta fue el escaneo de todos los nombres de `process.env`: una variable heredada no consumida cuyo nombre coincidia con la expresion prohibida activaba el `invalid_state` generico. El runner ahora construye una configuracion explicita allowlisted; las inyecciones deliberadas de service role, access token o IDs siguen bloqueadas. Los fallos esperados emiten un unico codigo sanitizado y no imprimen source ni stack.

El fragmento observado `constc=claims(key)` fue la representacion compactada de `const c = claims(key)`; no existia una declaracion ausente. La ruta JWT legacy se cubre ahora con claves anon validas, rol incorrecto y proyecto incorrecto.

El operador elimino la identidad antes de conservar su UUID. No se intentara reconstruir, buscar ni inferir ese UUID. El cleanup externo se verifico posteriormente por email y conteos globales: usuario Auth por email cero, profile por email cero, profiles huerfanos cero, user_settings huerfanos cero y `cleanup_verified=true`. No se reconstruyo, busco ni infirio el UUID.

La segunda tentativa fue tambien diagnostica: el verificador rechazo localmente la forma del email con `invalid_email_shape`, antes de `RUN` y antes de login. La identidad se elimino y la misma verificacion agregada devolvio los cuatro conteos en cero y `cleanup_verified=true`. No constituye evidencia runtime y no se registra el email.

## Ejecucion Auth definitiva

La ejecucion definitiva en Supabase test termino con `RUN`, `AUTH-LOGIN`, `PROFILE-PROVISIONED`, `SETTINGS-PROVISIONED`, `PROFILE-UPDATED-AT`, `SETTINGS-UPDATED-AT`, `AUTH-SIGNOUT` y `DELETE-ABSENCE` en PASS. El resumen fue siete resultados contabilizados, cero FAIL, cero INCONCLUSIVE, `verifyCreateCompleted=true`, `signOutCompleted=true`, `verifyDeleteCompleted=true`, `deletionVerified=true`, `successful=true` y exit 0. `RUN` es un evento de configuracion y no incrementa el contador de casos.

Tras eliminar la identidad, la consulta autorizada devolvio usuario Auth por email cero, profile por email cero, profiles huerfanos globales cero, user_settings huerfanos globales cero y `cleanup_verified=true`. No se documentan email, UUID, password, token, clave ni cuerpos. Esto acredita `handle_new_user`, el aprovisionamiento 1:1, los triggers `updated_at` de `profiles` y `user_settings`, cierre de sesion y ausencia final.

## Cobertura final de las 16 vinculaciones trigger

| Funcion | Trigger y tabla | Evidencia runtime posterior al REVOKE |
| --- | --- | --- |
| `handle_new_user()` | `auth.users.on_auth_user_created` | Auth definitivo: profile/settings 1:1 |
| `enforce_grado_ownership()` | `public.grados.trg_grado_ownership` | ownership: propio y cruces P0001 |
| `enforce_materia_ownership()` | `public.materias.trg_materia_ownership` | ownership: propio y cruces P0001 |
| `enforce_tema_ownership()` | `public.temas.trg_tema_ownership` | ownership: propio y cruces P0001 |
| `enforce_planeacion_tema_ownership()` | `public.planeaciones.trg_planeacion_tema_ownership` | ownership: propio y cruces P0001 |
| `set_updated_at()` | `set_anexos_updated_at` / `anexos` | 03D2B |
| `set_updated_at()` | `set_examenes_updated_at` / `examenes` | 03D2B |
| `set_updated_at()` | `trg_grados_updated_at` / `grados` | ownership |
| `set_updated_at()` | `set_listas_cotejo_updated_at` / `listas_cotejo` | 03D2B |
| `set_updated_at()` | `trg_materias_updated_at` / `materias` | ownership |
| `set_updated_at()` | `trg_planeaciones_updated_at` / `planeaciones` | 03D2A |
| `set_updated_at()` | `trg_planteles_updated_at` / `planteles` | ownership |
| `set_updated_at()` | `trg_profiles_updated_at` / `profiles` | Auth definitivo |
| `set_updated_at()` | `trg_temas_updated_at` / `temas` | ownership |
| `set_updated_at()` | `trg_unidades_updated_at` / `unidades` | ownership |
| `set_updated_at()` | `trg_user_settings_updated_at` / `user_settings` | Auth definitivo |

El postverify confirmo ademas las 16 vinculaciones exactas y habilitadas. La evidencia runtime completa la continuidad de las seis funciones sin convertir las pruebas de la jerarquia congelada en una funcionalidad de producto.

## Procedimiento Auth ejecutado

Autoridad A: operador con acceso al Auth control plane del proyecto test. El service role no se entrega a scripts. Se usa **Authentication > Users > Add user > Create new user**, nunca Send invitation. Se proporciona password, se activa auto-confirmacion y se usa un email exclusivo terminado en `.invalid`. No hay metadata obligatoria: si `full_name` no se proporciona, el cuerpo versionado guarda `''` mediante `coalesce`; el verificador compara internamente cualquiera de las dos variantes con la sesion. Invite, magic link y reset quedan prohibidos porque usan flujos de correo.

Autoridad B: verificador local autenticado como el usuario sintetico. Solo recibe por entrada oculta public key test, email y password. Obtiene el UUID desde `signInWithPassword`, mantiene la sesion en memoria, usa RLS y no acepta UUID, token o service role.

Secuencia ejecutada en test y conservada como procedimiento reproducible:

1. Confirmar visualmente `educativo-backend-test`; crear exactamente una cuenta con Add user/Create new user, auto-confirmada, email `.invalid` y password oculto. No es necesario agregar metadata; si el panel permite `full_name`, puede usarse un marcador sintetico. Conservar localmente email/password solo hasta el cleanup; el verificador obtiene el UUID de la sesion y nunca lo imprime.
2. Ejecutar `pwsh -NoProfile -File tests/isolation/start-03d3c1-auth.ps1`, introducir los tres secretos ocultos y usar `verify-create`. Debe producir seis PASS: login, profile, settings, dos timestamps y signout. No elimina la cuenta.
3. En Authentication > Users, eliminar manualmente esa identidad exacta. La FK versionada acredita que el DELETE de `auth.users` debe aplicar CASCADE a ambas tablas; no borrar primero las filas publicas.
4. En SQL Editor del mismo proyecto test, abrir `docs/test-environment/03d3c1_auth_deletion_verify.sql`, sustituir localmente el email placeholder y ejecutar una sola consulta read-only. Debe devolver cuatro conteos en cero y `deletion_verified=true`; los conteos globales de huerfanos hacen fallar cerrado el procedimiento.
5. Volver al verificador, usar `verify-delete` e introducir solo los tres conteos agregados. PASS requiere los tres ceros. Después `quit`.

Recovery Auth: buscar en el panel exclusivamente el email sintetico exacto conservado localmente. Cero identidades conduce a la consulta agregada de residuos; una identidad compatible se elimina en el control plane y luego se verifica; mas de una coincidencia, metadata incompatible o autoridad insuficiente detiene todo. Un DELETE ambiguo exige releer antes de reintentar. No recrear usuarios, no usar SQL de escritura y no declarar cleanup por respuesta UI ni por RLS.

Riesgos de parada: imposibilidad de auto-confirmar sin correo, falta de autoridad de borrado, trigger que deja solo una de las dos filas, cardinalidad distinta, owner/metadata inesperado, cascade no verificable o cualquier necesidad de revelar credenciales. En cualquiera de esos casos no se promociona 03D3C1.

## Cobertura de `set_updated_at`

| Tabla | Evidencia posterior al REVOKE | Pendiente minimo |
| --- | --- | --- |
| `planeaciones` | 03D2A | ninguno |
| `anexos`, `listas_cotejo`, `examenes` | 03D2B | ninguno |
| `planteles`, `grados`, `materias`, `unidades`, `temas` | ownership run: UPDATE propio PASS | ninguno |
| `profiles`, `user_settings` | no dirigida | procedimiento Auth: UPDATE propio sintetico |

03D2C no agrega tablas con `set_updated_at`. Con ambos planes ejecutados se cubren las once tablas sin repetir 03D2A/B.

## Estado y limites

Preflight, migracion y postverify 03D3C1 estan aprobados en Supabase test; rollback no ejecutado. Ownership termino con 22 PASS y Auth definitivo con siete PASS contabilizados, sin FAIL/INCONCLUSIVE y con cleanups verificados. **03D3C1 esta completada en test.** Produccion no tiene 03D3A/03D3C1; 03D3C permanece abierta por 03D3C2 y 03D3C3, Storage corresponde a 03E y la regresion E2E completa a 03F.

