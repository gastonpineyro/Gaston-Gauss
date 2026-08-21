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
```

por tus valores reales. Guardá el archivo.

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
  un selector en cada fila.
- Cuando alguien reserva un alquiler (desde una ficha de producto o desde
  `alquileres.html`) y las fechas se superponen con un pedido que vos ya
  tenés en estado *pendiente* o *confirmado* para ese mismo equipo, el sitio
  le avisa que no está disponible y no lo deja continuar. Si cancelás un
  pedido desde el panel, esas fechas quedan libres de nuevo automáticamente.

## Archivos que se agregaron

| Archivo | Qué hace |
|---|---|
| `supabase-schema.sql` | Se ejecuta una sola vez en Supabase (Paso 2). |
| `supabase-config.js` | Tus credenciales (Paso 4). |
| `db.js` | Conexión compartida: guardar pedidos y chequear disponibilidad. |
| `admin.html` / `admin.js` | Panel donde ves y gestionás los pedidos. |
| `carrito.js` / `reservas.js` | Se les agregó el chequeo de disponibilidad y el guardado del pedido antes de abrir WhatsApp. |

## Límites del plan gratuito de Supabase

El plan gratis incluye 500 MB de base de datos y el proyecto se pausa solo
si pasás **7 días seguidos sin actividad** (se reactiva solo con que alguien
entre a `admin.html` o se genere un pedido; si se llega a pausar por
inactividad larga, se reactiva con un click desde el panel de Supabase). Para
una ortopedia con movimiento normal, no debería ser un problema.
