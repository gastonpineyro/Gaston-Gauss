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
/* BACKEND PROPIO (opcional). Si dejás esto vacío, el sitio usa Supabase como hasta ahora.
   Cuando tengas el servidor propio funcionando, poné acá su dirección (sin "/" al final),
   por ejemplo: "https://api.tudominio.com.ar". Y listo: el sitio pasa a usar tu servidor. */
const BACKEND_URL = "";

const SITE_URL = "https://gastonpineyro.github.io/Gaston-Gauss";

/* Alias bancario / de Mercado Pago que se le manda al cliente para
   renovar el alquiler. Cambialo por el tuyo. */
const ALIAS_PAGO = "GAUSS.ORTOPEDIA";

/* Link del formulario de pedido (Google Forms, Typeform, etc.). Pegalo
   entre las comillas. Mientras esté vacío, el botón no se muestra en el
   sitio. */
const LINK_FORMULARIO = "";

/* Pago online con Mercado Pago (tarjeta, débito, dinero en cuenta).
   Dejalo en false hasta que hayas hecho los pasos del archivo
   LEEME-PAGOS.md (crear las 2 funciones en Supabase y cargar tu token).
   Cuando esté todo listo, cambialo a true. */
const PAGOS_ONLINE = false;

/* Pago por transferencia / QR desde el carrito (sin comisiones).
   Antes de ponerlo en true, corré el SQL 10-transferencia en Supabase.
   - TITULAR_PAGO y CBU_PAGO son opcionales (dejalos vacíos "" si no querés mostrarlos).
   - QR_PAGO: nombre del archivo con tu QR (ej: "qr-pago.png") subido junto al sitio.
     Si lo dejás vacío, solo se muestra el alias. */
const PAGO_TRANSFERENCIA = true;
const TITULAR_PAGO = "GAUSS ORTOPEDIA SAS (CUIT 30-71751203-7) - Banco Macro";
const CBU_PAGO = "2850826730094208477611";
const QR_PAGO = "qr-pago.png";
