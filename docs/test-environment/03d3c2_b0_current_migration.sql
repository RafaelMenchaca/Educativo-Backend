BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.ai_generation_calls, public.ai_generation_jobs, public.anexos,
  public.examen_generation_items, public.examen_generation_jobs, public.examenes,
  public.grados, public.listas_cotejo, public.materias, public.planeacion_batches,
  public.planeaciones, public.planteles, public.profiles, public.temas,
  public.unidades, public.user_profiles, public.user_settings
FROM anon;

REVOKE TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.ai_generation_calls, public.ai_generation_jobs, public.anexos,
  public.examen_generation_items, public.examen_generation_jobs, public.examenes,
  public.grados, public.listas_cotejo, public.materias, public.planeacion_batches,
  public.planeaciones, public.planteles, public.profiles, public.temas,
  public.unidades, public.user_profiles, public.user_settings
FROM authenticated;

REVOKE USAGE, SELECT, UPDATE ON SEQUENCE public.planeaciones_id_seq FROM anon;

COMMIT;
