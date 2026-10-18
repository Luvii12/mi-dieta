// Proyecto de Supabase de la app. La clave es la pública («publishable»): puede ir aquí porque sin sesión
// no da acceso a nada (lo impiden las reglas por fila de supabase/esquema.sql). La clave secreta nunca va al repo.
// scripts/servidor_local.js sirve otro contenido para este archivo cuando se prueba con la base falsa.
export const SUPABASE = {
  url: "https://umzalhsxowdwteqursyc.supabase.co",
  clave: "sb_publishable_MEIqvHNp-DYZDfP8tpy5IA_eyCUThRw",
};
