import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Devuelve un cliente de Supabase tipado con nuestro esquema.
 * Si aún no se configuraron las variables de entorno en desarrollo,
 * usa placeholders seguros en build-time para que la compilación no falle
 * y la UI muestre un aviso claro al usuario.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  const url = supabaseUrl || "https://placeholder-project.supabase.co";
  const key = supabaseAnonKey || "placeholder-anon-key";

  if (typeof window === "undefined") {
    return createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  if (!browserClient) {
    browserClient = createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  return browserClient;
}

export const supabase = getSupabaseClient();
