// Configuración pública del sitio (estos valores NO son secretos: los ve cualquier navegador).
// Mientras estén vacíos, el sitio funciona igual que ahora (fotos de ejemplo, sin "Entrar").
// Completar con los datos del proyecto de Supabase (Settings → API) y la URL pública de las fotos en R2.
window.OLAS_CONFIG = {
  supabaseUrl: "",       // ej. "https://abcdxyz.supabase.co"
  supabaseAnonKey: "",   // la clave "anon public"
  photosUrl: "",         // ej. "https://fotos.olas.uy" o la URL r2.dev del bucket público
};
