#!/bin/sh
set -eu

echo "[audit-service] Applying Prisma schema..."

until npx prisma db push --schema=prisma/schema.prisma; do
  echo "[audit-service] Database not ready, retrying in 3 seconds..."
  sleep 3
done

exec "$@"
