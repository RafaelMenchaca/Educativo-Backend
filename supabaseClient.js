// supabaseClient.js
import { createClient } from '@supabase/supabase-js';
import { runtimeConfig } from './src/config/runtime.js';

const supabaseUrl = runtimeConfig.supabaseUrl;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabasePublicKey = process.env.SUPABASE_KEY;

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Backward compatibility alias for existing imports.
export const supabase = supabaseAdmin;

export function createUserClient(accessToken) {
  if (!accessToken) {
    throw new Error('Access token is required to create a user Supabase client');
  }

  return createClient(supabaseUrl, supabasePublicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}
