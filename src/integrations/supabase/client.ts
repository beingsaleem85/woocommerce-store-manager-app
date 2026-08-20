import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Supabase client instance.
 * Will be `null` if environment variables are not configured.
 * Always check for null before using: `if (!supabase) return;`
 */
export const supabase: SupabaseClient<Database> | null = supabaseUrl && supabaseAnonKey ? createClient<Database>(supabaseUrl, supabaseAnonKey) : null;
