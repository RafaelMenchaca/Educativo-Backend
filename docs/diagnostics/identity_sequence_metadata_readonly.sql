-- Session 02C supplement. READ ONLY. Do not run as part of initialization.
-- One identity column only; catalogs only. No last_value, nextval, setval,
-- application rows, auth.users rows, or connection/credential information.
-- Run separately in the SOURCE SQL Editor only in a later authorized session.
SELECT tn.nspname AS table_schema, t.relname AS table_name,
       a.attname AS column_name, a.attidentity AS identity_kind,
       sn.nspname AS sequence_schema, s.relname AS sequence_name,
       pg_catalog.pg_get_userbyid(s.relowner) AS sequence_owner,
       pg_catalog.format_type(q.seqtypid, NULL) AS sequence_type,
       q.seqstart, q.seqincrement, q.seqmin, q.seqmax, q.seqcache, q.seqcycle,
       d.deptype AS ownership_dependency
FROM pg_catalog.pg_class t
JOIN pg_catalog.pg_namespace tn ON tn.oid = t.relnamespace
JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid
JOIN pg_catalog.pg_depend d
  ON d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
 AND d.refobjid = t.oid AND d.refobjsubid = a.attnum
 AND d.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
 AND d.deptype = 'i'
JOIN pg_catalog.pg_class s ON s.oid = d.objid AND s.relkind = 'S'
JOIN pg_catalog.pg_namespace sn ON sn.oid = s.relnamespace
JOIN pg_catalog.pg_sequence q ON q.seqrelid = s.oid
WHERE tn.nspname = 'public' AND t.relname = 'planeaciones'
  AND a.attname = 'id' AND a.attidentity <> '' AND NOT a.attisdropped;
