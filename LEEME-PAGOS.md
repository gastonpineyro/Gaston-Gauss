# Pagos online con Mercado Pago (tarjeta, débito, dinero en cuenta)

El cliente puede elegir "Pagar ahora" en el carrito, o seguir por WhatsApp como siempre.
Cuando paga, el pedido aparece en el panel con "💳 Pagado online $X".

## Pasos (una sola vez)

1. **Supabase → SQL Editor**: pegá y corré `9-pagos-online.sql`.
2. **Mercado Pago**: entrá a https://www.mercadopago.com.ar/developers/panel → *Tus integraciones* → *Crear aplicación*
   (tipo "Pagos online", producto "Checkout Pro"). Copiá el **Access Token de producción** (empieza con `APP_USR-`).
   Para probar primero, usá el de *Credenciales de prueba*.
3. **Supabase → Edge Functions → Create a new function**, dos veces:
   - `crear-pago` → pegá el contenido de `supabase/functions/crear-pago/index.ts` → Deploy.
   - `mp-webhook` → pegá el contenido de `supabase/functions/mp-webhook/index.ts` → **desactivá "Verify JWT"** → Deploy.
4. **Supabase → Edge Functions → Secrets**: agregá `MP_ACCESS_TOKEN` = tu token.
   (Opcional: `SITE_URL` si cambia la dirección del sitio.)
5. En `supabase-config.js` cambiá `const PAGOS_ONLINE = false;` por `true`.
6. Hacé una compra de prueba con el token de prueba, y después cambiá al token de producción.

## Cosas a saber
- Mercado Pago cobra una comisión por cada pago; la ves en tu cuenta de Mercado Pago.
- El monto del cobro se toma del pedido guardado en la base, no del navegador. Si alguien pagó un monto distinto
  al del pedido, el panel lo marca en rojo "⚠️ Pagó $X pero el pedido es de $Y (revisar)".
- Los pedidos no se confirman solos: pagar online no reemplaza que vos confirmes la disponibilidad.
- Máximo 6 productos distintos por pago online.
