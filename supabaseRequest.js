import { createClient } from '@supabase/supabase-js';

export function supabaseForRequest(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');

  if (!token) return null;

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY, // anon key
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
}
