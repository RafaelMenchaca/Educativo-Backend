// supabaseClient.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const { SUPABASE_URL, SUPABASE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('❌ Faltan SUPABASE_URL o SUPABASE_KEY en el entorno (.env)');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);