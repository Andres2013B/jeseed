/*
  CONFIGURACIÓN DE JESED
  ----------------------
  Deja estos valores vacíos para usar el MODO DEMO (todo se guarda en el navegador).
  Para cuentas reales y comunidad compartida, pega aquí los datos de tu proyecto de Supabase:
  Supabase > Project Settings > API > "Project URL" y "anon public key".
  (La anon key es pública por diseño; la seguridad la dan las reglas RLS de supabase/schema.sql)
*/
window.JESED_CONFIG = {
  // Solo se permiten cuentas con correo de este dominio (ej. nombre@olamiort.edu.mx)
  SCHOOL_DOMAIN: "olamiort.edu.mx",
  SUPABASE_URL: "https://tcnewagyrlyllxkaazgu.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjbmV3YWd5cmx5bGx4a2Fhemd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNzI2NDYsImV4cCI6MjEwODg0ODY0Nn0.dPdx-HeE1JQdaXwyOaL1yWSVbE0pOG-DuY18X4WRiYA"
};
