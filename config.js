// Configuración pública del sitio (estos valores NO son secretos: los ve cualquier navegador).
// Mientras estén vacíos, el sitio funciona igual que ahora (fotos de ejemplo, sin "Entrar").
// Completar con los datos del proyecto de Supabase (Settings → API) y la URL pública de las fotos en R2.
window.OLAS_CONFIG = {
  supabaseUrl: "https://gcakonxuqpcdpydrvyhz.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjYWtvbnh1cXBjZHB5ZHJ2eWh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMzY0MDQsImV4cCI6MjEwOTgxMjQwNH0.s8nRyy0xRw_wDyoVITJ98yuiKkA7PmfnehukeEn21c0", // clave "anon public" (pública)
  photosUrl: "",         // ej. "https://fotos.olas.uy" o la URL r2.dev del bucket público
};
