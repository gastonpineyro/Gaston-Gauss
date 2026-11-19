#!/usr/bin/env bash
# Instala el backend de Gauss en un VPS Ubuntu 22.04 / 24.04 (Hostinger u otro).
# Uso (como root):  bash instalar-vps.sh api.tudominio.com.ar tu@correo.com https://www.tudominio.com.ar[,https://otra.pagina]
# Se puede volver a correr: actualiza el código sin tocar tus datos ni tus claves.
set -euo pipefail

DOMINIO="${1:-}"; CORREO="${2:-}"; ORIGENES="${3:-}"
if [[ -z "$DOMINIO" || -z "$CORREO" || -z "$ORIGENES" ]]; then
  echo "Uso: bash instalar-vps.sh api.tudominio.com.ar tu@correo.com https://www.tudominio.com.ar"
  exit 1
fi
[[ $EUID -eq 0 ]] || { echo "Ejecutalo como root (sudo -i)."; exit 1; }

REPO="https://github.com/gastonpineyro/Gaston-Gauss.git"
APP=/opt/gauss
DATOS=/var/lib/gauss
export DEBIAN_FRONTEND=noninteractive

echo "==> 1/7 Programas base"
apt-get update -y
apt-get install -y curl ca-certificates gnupg git ufw nginx postgresql certbot python3-certbot-nginx openssl

if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  echo "==> Instalando Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> 2/7 Usuario del sistema y carpetas"
id gauss >/dev/null 2>&1 || useradd --system --home-dir "$DATOS" --create-home --shell /usr/sbin/nologin gauss
mkdir -p "$DATOS/archivos" /var/backups/gauss
chown -R gauss:gauss "$DATOS"

echo "==> 3/7 Código"
if [[ -d "$APP/.git" ]]; then git -C "$APP" pull --ff-only; else git clone "$REPO" "$APP"; fi
cd "$APP/backend"
npm ci --omit=dev

echo "==> 4/7 Base de datos y claves"
if [[ ! -f "$APP/backend/.env" ]]; then
  DBPASS="$(openssl rand -hex 24)"
  JWT="$(openssl rand -hex 48)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create role gauss login password '$DBPASS'" 2>/dev/null \
    || sudo -u postgres psql -v ON_ERROR_STOP=1 -c "alter role gauss with login password '$DBPASS'"
  sudo -u postgres psql -tc "select 1 from pg_database where datname='gauss'" | grep -q 1 \
    || sudo -u postgres createdb -O gauss gauss
  cat > "$APP/backend/.env" <<ENV
PORT=3000
DATABASE_URL=postgres://gauss:${DBPASS}@127.0.0.1:5432/gauss
JWT_SECRET=${JWT}
SESION_HORAS=12
ORIGENES_PERMITIDOS=${ORIGENES}
CARPETA_ARCHIVOS=${DATOS}/archivos
URL_PUBLICA=https://${DOMINIO}
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
SITE_URL=${ORIGENES%%,*}
ENV
  chown gauss:gauss "$APP/backend/.env"; chmod 600 "$APP/backend/.env"
  echo "   (claves nuevas creadas en $APP/backend/.env)"
else
  echo "   (ya existía .env: se conserva)"
fi
chown -R gauss:gauss "$APP"
sudo -u gauss bash -c "cd $APP/backend && npm run migrar"

echo "==> 5/7 Servicio (arranca solo, se reinicia si falla)"
cp "$APP/backend/deploy/gauss.service" /etc/systemd/system/gauss.service
systemctl daemon-reload
systemctl enable --now gauss
systemctl restart gauss

echo "==> 6/7 Web (nginx) y HTTPS"
sed "s/__DOMINIO__/${DOMINIO}/g" "$APP/backend/deploy/nginx-gauss.conf" > /etc/nginx/sites-available/gauss
ln -sf /etc/nginx/sites-available/gauss /etc/nginx/sites-enabled/gauss
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos -m "$CORREO" --redirect

echo "==> 7/7 Firewall y copias de seguridad diarias"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
install -m 755 "$APP/backend/deploy/backup-diario.sh" /usr/local/bin/gauss-backup
echo "0 3 * * * root /usr/local/bin/gauss-backup >> /var/log/gauss-backup.log 2>&1" > /etc/cron.d/gauss-backup

echo
echo "Listo. Probá:  curl https://${DOMINIO}/api/health   (tiene que responder {\"ok\":true})"
echo "Falta crear tu usuario del panel:  cd $APP/backend && sudo -u gauss npm run crear-admin -- tu@correo.com"
