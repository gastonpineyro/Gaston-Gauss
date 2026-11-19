# Backend propio de Gauss Ortopedia

Reemplaza a Supabase con un servidor propio (Node.js + PostgreSQL). **El sitio sigue
funcionando con Supabase hasta que vos decidas el cambio**: todo depende de una sola
línea (`BACKEND_URL`) en `supabase-config.js`.

## Qué incluye

| Parte | Qué hace |
|---|---|
| `schema.sql` | Las 7 tablas de hoy (pedidos, stock, equipos QR, contactos, plantillas, etc.) |
| Login del panel | Usuario y contraseña (guardada cifrada), sesión de 12 horas, límite de intentos |
| API de datos | Lo que antes hacía Supabase: el panel y el carrito leen y guardan igual que siempre |
| Comprobantes | Subida de fotos/PDF (máx. 8 MB), se verifica que sean imágenes reales |
| Pagos | Mercado Pago (crear pago + aviso automático), apagado hasta que cargues el token |
| `deploy/` | Instalador del servidor, HTTPS, copias de seguridad diarias |

## Seguridad (lo que se controla en el servidor)

- Un visitante **solo** puede: crear un pedido, ver stock y disponibilidad (sin datos personales),
  ver el resumen de **un** pedido si tiene su código, y subir un comprobante.
- Nadie sin sesión puede leer, cambiar ni borrar pedidos, contactos ni plantillas.
- Un visitante no puede inventar que un pedido ya está pagado ni cambiar su estado.
- Todas las consultas a la base van con parámetros (no hay forma de inyectar SQL).
- El monto de Mercado Pago sale siempre de la base, nunca del navegador, y los avisos de pago
  se verifican con Mercado Pago.
- Los archivos subidos se sirven con cabeceras que impiden que ejecuten código.

> Nota: en el Supabase actual, según el SQL que tenemos, cualquiera con la clave pública del
> sitio podría leer la tabla de pedidos completa (incluye nombres y DNI). El backend propio
> **no tiene ese problema**.

## Instalación en el servidor (Hostinger VPS, Ubuntu 22.04 o 24.04)

1. Contratá el VPS y elegí **Ubuntu** como sistema. Anotá la IP.
2. En el lugar donde tenés el dominio, creá un registro **A**: `api` → IP del VPS
   (queda `api.tudominio.com.ar`). Esperá unos minutos a que se propague.
3. Entrá por SSH (`ssh root@IP`) y corré:
   ```
   curl -fsSL https://raw.githubusercontent.com/gastonpineyro/Gaston-Gauss/main/backend/deploy/instalar-vps.sh -o instalar.sh
   bash instalar.sh api.tudominio.com.ar tu@correo.com https://www.tudominio.com.ar
   ```
   (el último dato es la dirección de tu página; si usás más de una, separalas con coma).
4. Creá tu usuario del panel:
   ```
   cd /opt/gauss/backend && sudo -u gauss npm run crear-admin -- tu@correo.com
   ```
5. Probá `https://api.tudominio.com.ar/api/health`: tiene que responder `{"ok":true}`.

## Pasar tus datos actuales

1. En el panel actual: **Descargar copia de seguridad** (te baja un `.json`).
2. Subilo al servidor (por ejemplo con `scp gauss-backup-....json root@IP:/root/`).
3. Importalo:
   ```
   cd /opt/gauss/backend && sudo -u gauss npm run importar -- /root/gauss-backup-....json
   ```
   Se puede repetir sin duplicar nada. Si algo falla, no se importa nada.

## Cambiar el sitio al servidor propio

En `supabase-config.js` poné:
```
const BACKEND_URL = "https://api.tudominio.com.ar";
```
y subilo a GitHub. **Para volver atrás** (si algo sale mal), dejalo en `""` y el sitio vuelve a Supabase.

> Los comprobantes que ya subieron los clientes siguen en Supabase: sus links viejos
> funcionan mientras no borres el proyecto de Supabase.

## Copias de seguridad

- Cada noche a las 3 se guarda la base y los comprobantes en `/var/backups/gauss` (14 días).
- **Importante:** esa copia está en el mismo servidor. Bajá una a tu computadora de vez en cuando
  (`scp root@IP:/var/backups/gauss/base-AAAA-MM-DD.sql.gz .`) o activá las copias del propio VPS.
- Restaurar: `gunzip -c base-AAAA-MM-DD.sql.gz | sudo -u postgres psql gauss`
- El botón "Descargar copia de seguridad" del panel sigue funcionando igual.

## Actualizar el servidor

`bash /opt/gauss/backend/deploy/instalar-vps.sh api.tudominio.com.ar tu@correo.com https://www.tudominio.com.ar`
(baja el código nuevo y reinicia; no toca tus datos ni tus claves).

## Mercado Pago (cuando lo quieras usar)

Cargá `MP_ACCESS_TOKEN` (y `MP_WEBHOOK_SECRET`) en `/opt/gauss/backend/.env`, `systemctl restart gauss`,
y en `supabase-config.js` poné `PAGOS_ONLINE = true`. En Mercado Pago, la dirección de avisos es
`https://api.tudominio.com.ar/api/functions/mp-webhook`.

## Pendiente de portar

- **Exportar a Google Sheets** (botón de facturación del panel): hoy usa una función de Supabase que
  no está en este repositorio. Con `BACKEND_URL` activo ese botón sigue llamando a Supabase.
  Para pasarlo necesito la planilla destino y el formato de columnas.

## Pruebas

`npm test` (necesita una base PostgreSQL de prueba en `DATABASE_URL`). Verifican permisos, intentos de
inyección, subida de archivos falsos, login y pagos.
