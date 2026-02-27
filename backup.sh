#!/bin/bash
# Portfolio Tracker — Backup Script v2
set -euo pipefail

BACKUP_DIR="${BACKUP_PATH:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_FILE="${DATABASE_PATH:-./data/portfolio.db}"
BACKUP_FILE="$BACKUP_DIR/portfolio_$TIMESTAMP.db"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_FILE" ]; then
  echo "❌ Database not found: $DB_FILE"
  exit 1
fi

echo "📦 Creating backup…"
cp "$DB_FILE" "$BACKUP_FILE"
gzip "$BACKUP_FILE"
echo "✓ Backup: $BACKUP_FILE.gz"

# Remove backups older than 30 days
find "$BACKUP_DIR" -name "portfolio_*.db.gz" -mtime +30 -delete
echo "✓ Old backups pruned (>30 days)"

SIZE=$(du -h "$BACKUP_FILE.gz" | cut -f1)
echo "📊 Size: $SIZE"
echo ""
echo "📁 All backups:"
ls -lh "$BACKUP_DIR"/*.gz 2>/dev/null | awk '{print $9, "("$5")"}'
