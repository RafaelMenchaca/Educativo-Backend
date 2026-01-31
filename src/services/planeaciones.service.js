import { supabase } from '../../supabaseClient.js';
import OpenAI from 'openai';
import { randomUUID } from 'crypto';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function listarPlaneaciones(userId) {
  const { data, error } = await supabase
    .from('planeaciones')
    .select('*')
    .eq('user_id', userId)
    .order('fecha_creacion', { ascending: false });

  if (error) throw error;
  return data;
}

export async function obtenerPlaneacionPorId(id, userId) {
  const { data, error } = await supabase
    .from('planeaciones')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function actualizarPlaneacion(id, update, userId) {
  const { data, error } = await supabase
    .from('planeaciones')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function eliminarPlaneacion(id, userId) {
  const { error } = await supabase
    .from('planeaciones')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}
