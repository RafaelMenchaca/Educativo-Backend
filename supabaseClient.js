// supabaseClient.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_KEY } = process.env;

if (!SUPABASE_URL || !(SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY)) {
  throw new Error('❌ Faltan SUPABASE_URL y SUPABASE_*KEY en el entorno (.env)');
}

// Preferir service role si existe; si no, caer a anon (solo dev)
const KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY;

export const supabase = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
