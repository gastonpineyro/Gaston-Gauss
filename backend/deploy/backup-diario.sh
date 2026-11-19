#!/usr/bin/env bash
# Copia diaria de la base y de los comprobantes. Guarda las últimas 14.
set -euo pipefail
DEST=/var/backups/gauss
FECHA="$(date +%F)"
mkdir -p "$DEST"
sudo -u postgres pg_dump gauss | gzip > "$DEST/base-$FECHA.sql.gz"
tar -czf "$DEST/archivos-$FECHA.tar.gz" -C /var/lib/gauss archivos
chmod 600 "$DEST"/*
find "$DEST" -type f -mtime +14 -delete
echo "$(date '+%F %T') copia lista: $DEST/base-$FECHA.sql.gz"
