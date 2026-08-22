# Backend de Gauss Ortopedia (Supabase)

El sitio sigue siendo un sitio estático (HTML/CSS/JS, se puede alojar en GitHub
Pages tal cual). Lo que se agregó es una conexión opcional a una base de datos
gratuita (Supabase) para que:

- Cada pedido (venta o alquiler) que alguien manda por WhatsApp **también
  quede guardado**, y lo puedas ver en un panel propio (`admin.html`).
- Antes de dejar reservar un alquiler, el sitio **chequea que ese equipo no
  esté ya reservado en esas fechas** (disponibilidad real, no solo un
  formulario).

**Mientras no lo configures, el sitio funciona exactamente igual que antes**
(el carrito y las reservas se mandan por WhatsApp con normalidad). La base de
datos es un agregado, no un reemplazo.

## Paso 1 — Crear la cuenta y el proyecto (gratis, ~3 minutos)

1. Entrá a **https://supabase.com** y creá una cuenta (podés usar tu cuenta de GitHub).
2. Creá un proyecto nuevo. Elegí una región cercana (por ejemplo, São Paulo).
   Anotá la contraseña de base de datos que te pida (no la vas a necesitar
   para esto, pero por las dudas).
3. Esperá 1-2 minutos a que el proyecto termine de crearse.

## Paso 2 — Crear las tablas

1. En el menú izquierdo, andá a **SQL Editor**.
2. Click en **New query**.
3. Abrí el archivo `supabase-schema.sql` (está en esta misma carpeta), copiá
   todo su contenido y pegalo ahí.
4. Click en **Run**. Deberías ver "Success. No rows returned".

Esto crea la tabla `pedidos` y las reglas de seguridad: cualquier visitante
puede crear un pedido o consultar fechas ocupadas, pero **solo vos** (logueado)
podés ver los datos personales completos y cambiar el estado de un pedido.

## Paso 3 — Crear tu usuario para entrar al panel

1. En el menú izquierdo, andá a **Authentication > Users**.
2. Click en **Add user > Create new user**.
3. Cargá el email y la contraseña con la que vas a entrar a `admin.html`.
   (Tildá "Auto Confirm User" si te lo pregunta).

## Paso 4 — Conectar el sitio con tu proyecto

1. En el menú izquierdo, andá a **Project Settings > API**.
2. Copiá el valor de **Project URL**.
3. Copiá el valor de **anon public** (una clave larga).
4. Abrí el archivo `supabase-config.js` de esta carpeta y reemplazá:

```js
const SUPABASE_URL = "PEGA_ACA_TU_PROJECT_URL";
const SUPABASE_ANON_KEY = "PEGA_ACA_TU_ANON_KEY";
const SITE_URL = "PEGA_ACA_LA_URL_DE_TU_SITIO";
const ALIAS_PAGO = "PEGA_ACA_TU_ALIAS";
```

por tus valores reales:
- `SUPABASE_URL` y `SUPABASE_ANON_KEY`: los que copiaste recién.
- `SITE_URL`: la URL pública donde vas a alojar el sitio (por ejemplo, tu link de GitHub Pages), **sin la barra "/" al final**. Se usa para armar el link de "subir comprobante" que se le manda al cliente. Si todavía no lo publicaste, dejalo como está y actualizalo cuando lo tengas — mientras tanto, los recordatorios van a salir sin ese link.
- `ALIAS_PAGO`: tu alias bancario o de Mercado Pago, el que le vas a pasar al cliente para que renueve.

Guardá el archivo.

> La clave "anon public" está pensada para ser pública (va en el navegador
> de cualquier visitante). No es un secreto: lo que se puede o no hacer con
> ella lo controlan las reglas que creaste en el Paso 2, no la clave en sí.

## Paso 5 — Subir los cambios

Subí todos los archivos (incluido `supabase-config.js` ya completado) a tu
repositorio de GitHub como siempre. Con eso ya queda funcionando.

## Cómo se usa en el día a día

- **`admin.html`** (hay un link chiquito "Panel" al pie de cada página): ahí
  te logueás con el usuario del Paso 3 y ves todos los pedidos, con filtros
  por estado y tipo, y podés marcarlos como *confirmado* o *cancelado* con
  un selector en cada fila. Tiene tres pestañas:

  - **Pedidos**: todos, con la columna "Acciones". Cuando un alquiler está
    en estado *confirmado*, aparece un botón **📦 Avisar retiro** que abre
    WhatsApp con un mensaje ya escrito para avisarle al cliente que puede
    venir a buscar el equipo — vos solo tenés que apretar "Enviar". No es
    100% automático (WhatsApp no lo permite gratis), pero el mensaje ya
    sale armado con nombre, producto y fechas.
  - **Vencimientos próximos**: lista los alquileres confirmados que vencen
    en los próximos 3 días (o ya vencidos). Cada uno tiene un botón
    **🔔 Enviar recordatorio** que abre WhatsApp con un mensaje que incluye
    tu alias de pago y un link a `renovar.html` para que el cliente suba el
    comprobante.
  - **Comprobantes por revisar**: cuando un cliente sube una foto del
    comprobante desde `renovar.html`, aparece acá con la imagen. Con
    **✅ Confirmar y renovar** extendés el alquiler automáticamente por la
    misma duración (15 o 30 días) a partir de la fecha en que vencía, sin
    tener que cargar nada a mano. **❌ Rechazar** lo saca de la lista sin
    renovar (por si el comprobante no es válido).

- **`renovar.html`** es la página pública (sin login) donde el cliente ve el
  resumen de su alquiler, tu alias de pago, y puede subir la foto del
  comprobante. El link exacto para cada pedido (`renovar.html?pedido=...`)
  se arma solo dentro del mensaje de "Enviar recordatorio".

Cuando alguien reserva un alquiler y las fechas se superponen con un pedido
que vos ya tenés en estado *pendiente* o *confirmado* para ese mismo equipo,
el sitio le avisa que no está disponible y no lo deja continuar.

## Archivos que se agregaron

| Archivo | Qué hace |
|---|---|
| `supabase-schema.sql` | Se ejecuta en Supabase (Paso 2). Es seguro volver a correrlo si lo necesitás. |
| `supabase-config.js` | Tus credenciales, URL del sitio y alias de pago (Paso 4). |
| `db.js` | Conexión compartida: guardar pedidos, chequear disponibilidad, subir comprobantes. |
| `admin.html` / `admin.js` | Panel: pedidos, vencimientos próximos y comprobantes por revisar. |
| `renovar.html` / `renovar.js` | Página pública donde el cliente sube el comprobante para renovar. |
| `carrito.js` / `reservas.js` | Piden teléfono, chequean disponibilidad y guardan el pedido antes de abrir WhatsApp. |

## Sobre los avisos automáticos por WhatsApp

WhatsApp no permite enviar mensajes 100% automáticos (sin que nadie los
toque) a menos que uses la API oficial de WhatsApp Business (por ejemplo
vía Twilio o Meta Cloud API), que tiene costo mensual y requiere verificar
tu negocio. Por eso esta versión usa el enfoque gratuito: el sitio arma el
mensaje completo (con nombre, producto, fechas, alias, link) y abre
WhatsApp Web o la app con todo ya escrito — vos solo apretás "Enviar". Si
en algún momento querés pasar a mensajes 100% automáticos, avisame y
armamos la integración con la API paga.

## Límites del plan gratuito de Supabase

El plan gratis incluye 500 MB de base de datos y el proyecto se pausa solo
si pasás **7 días seguidos sin actividad** (se reactiva solo con que alguien
entre a `admin.html` o se genere un pedido; si se llega a pausar por
inactividad larga, se reactiva con un click desde el panel de Supabase). Para
una ortopedia con movimiento normal, no debería ser un problema.
