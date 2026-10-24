-- 03D3C1 Auth cleanup verification. Read-only; replace the local email placeholder in SQL Editor test only.
WITH target(email) AS (
  VALUES (NULL::text)
), counts AS (
  SELECT
    (SELECT email IS NOT NULL FROM target) AS target_configured,
    (SELECT count(*) FROM auth.users u JOIN target t ON lower(u.email) = lower(t.email)) AS auth_user_count,
    (SELECT count(*) FROM public.profiles p JOIN target t ON lower(p.email) = lower(t.email)) AS profile_count,
    (SELECT count(*) FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL) AS orphan_profile_count,
    (SELECT count(*) FROM public.user_settings s LEFT JOIN auth.users u ON u.id = s.user_id WHERE u.id IS NULL) AS orphan_user_settings_count
)
SELECT auth_user_count, profile_count, orphan_profile_count, orphan_user_settings_count,
       target_configured
       AND auth_user_count = 0
       AND profile_count = 0
       AND orphan_profile_count = 0
       AND orphan_user_settings_count = 0 AS deletion_verified
FROM counts;
