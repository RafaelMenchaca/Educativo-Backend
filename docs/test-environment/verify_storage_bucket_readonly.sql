-- 02D.1: READ ONLY. Prepared, not executed.
-- Manually confirm TEST project educativo-backend-test / gwdtlbisykzzplgzczzq.
-- Reads bucket configuration only, never objects, users or ownership fields.
-- Expected dashboard setting: 10 MB. Comparison uses 10 * 1024 * 1024 bytes;
-- confirm the dashboard conversion in the returned metadata, do not hide a DIFF.
WITH expected AS (
  SELECT 'planeacion-actividades'::text AS bucket_id,
         false AS expected_public,
         10485760::bigint AS expected_file_size_limit,
         ARRAY['image/*']::text[] AS expected_allowed_mime_types
), observed AS (
  SELECT b.id, b.name, b.public, b.file_size_limit, b.allowed_mime_types
  FROM storage.buckets AS b
  WHERE b.id = 'planeacion-actividades' OR b.name = 'planeacion-actividades'
), counted AS (
  SELECT pg_catalog.count(*) AS matches FROM observed
)
SELECT e.bucket_id AS expected_id, o.id, o.name, o.public,
       o.file_size_limit, o.allowed_mime_types,
       c.matches AS matching_bucket_count, c.matches = 1 AS exists_uniquely,
       e.expected_public, e.expected_file_size_limit, e.expected_allowed_mime_types,
       COALESCE(o.id = e.bucket_id AND o.name = e.bucket_id, false) AS id_name_match,
       COALESCE(o.public = e.expected_public, false) AS private_match,
       COALESCE(o.file_size_limit = e.expected_file_size_limit, false) AS size_match,
       COALESCE(o.allowed_mime_types = e.expected_allowed_mime_types, false) AS mime_match,
       CASE WHEN c.matches = 0 THEN 'MISSING'
            WHEN c.matches <> 1 THEN 'DIFF'
            WHEN o.id = e.bucket_id AND o.name = e.bucket_id
              AND o.public = e.expected_public
              AND o.file_size_limit = e.expected_file_size_limit
              AND o.allowed_mime_types = e.expected_allowed_mime_types THEN 'OK'
            ELSE 'DIFF' END AS status
FROM expected e CROSS JOIN counted c LEFT JOIN observed o ON true;

-- Separate observation only: avatars is NOT a requested/expected bucket.
SELECT pg_catalog.count(*) AS avatars_matching_bucket_count,
       pg_catalog.count(*) > 0 AS avatars_exists,
       CASE WHEN pg_catalog.count(*) = 0 THEN 'ABSENT_DO_NOT_CREATE'
            ELSE 'PRESENT_REVIEW_WITHOUT_CHANGES' END AS status
FROM storage.buckets AS b
WHERE b.id = 'avatars' OR b.name = 'avatars';
