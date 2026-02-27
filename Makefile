.PHONY: help start stop restart logs build backup restore clean stats

help:
	@echo "Portfolio Tracker v2.0 — Synology NAS"
	@echo ""
	@echo "  make start    — Start containers"
	@echo "  make stop     — Stop containers"
	@echo "  make restart  — Restart containers"
	@echo "  make logs     — Tail logs"
	@echo "  make build    — Rebuild & restart"
	@echo "  make backup   — Create DB backup"
	@echo "  make restore  — Restore last backup"
	@echo "  make stats    — Show /api/stats"
	@echo "  make clean    — ⚠ Delete containers + data"

start:
	docker-compose up -d

stop:
	docker-compose down

restart:
	docker-compose restart

logs:
	docker-compose logs -f

build:
	docker-compose build --no-cache
	docker-compose up -d

backup:
	@chmod +x backup.sh && ./backup.sh

restore:
	@echo "Restoring last backup…"
	@LATEST=$$(ls -1t backups/*.db.gz 2>/dev/null | head -1); \
	 if [ -z "$$LATEST" ]; then echo "No backups found"; exit 1; fi; \
	 docker-compose down; \
	 gunzip -c $$LATEST > data/portfolio.db; \
	 echo "✓ Restored: $$LATEST"; \
	 docker-compose up -d

clean:
	@echo "⚠  This will delete all containers AND data!"
	@read -p "Continue? [y/N] " -n 1 -r; echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		rm -rf data/*.db; \
		echo "✓ Done"; \
	fi

stats:
	@curl -s http://localhost:3001/api/stats | python3 -m json.tool
