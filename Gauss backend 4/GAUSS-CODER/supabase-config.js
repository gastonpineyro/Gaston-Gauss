/* ============================================================
   CONFIGURACIÓN DE SUPABASE
   ============================================================
   1. Entrá a https://supabase.com, creá una cuenta gratis y un
      proyecto nuevo (elegí una región cercana, por ej. São Paulo).
   2. Andá a: Project Settings > API.
   3. Copiá "Project URL" y pegalo abajo en SUPABASE_URL.
   4. Copiá la clave "anon public" y pegala abajo en SUPABASE_ANON_KEY.
      (Esta clave es pública a propósito: no da permisos de más,
      lo que se puede hacer con ella está controlado por las
      políticas de seguridad del archivo supabase-schema.sql)
   5. Guardá este archivo. Listo, no hay que tocar nada más.
   ============================================================ */

const SUPABASE_URL = "https://pivkrvlckrvapsclfsrs.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpdmtydmxja3J2YXBzY2xmc3JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczNDc1MTIsImV4cCI6MjEwMjkyMzUxMn0.sIk4WzNko9qdZ3msDG4FR9D7F4RSoWuYLQoPMVX6_fc";

/* URL pública final del sitio (una vez publicado, por ej. en GitHub
   Pages). Se usa para armar el link de "subir comprobante" que se le
   manda al cliente por WhatsApp. Actualizala cuando tengas la URL
   definitiva de tu sitio (sin la barra "/" final). */
const SITE_URL = "PEGA_ACA_LA_URL_DE_TU_SITIO";

/* Alias bancario / de Mercado Pago que se le manda al cliente para
   renovar el alquiler. Cambialo por el tuyo. */
const ALIAS_PAGO = "Gauss.ortopedia";
