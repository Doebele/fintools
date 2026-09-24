#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────
#  Deploy origin/main to the Strato VPS over SSH.
#  One-time setup:  cp .env.deploy.example .env.deploy  → fill it in.
#  Then:            ./deploy.sh            (or: make deploy)
#                   ./deploy.sh --dry-run  (show what would change, touch nothing)
#
#  Everything on the server runs in ONE ssh session (one password prompt at
#  most): check for local edits → DB backup → git pull --ff-only →
#  docker compose up -d --build → wait until both containers are healthy.
# ───────────────────────────────────────────────────────────
set -euo pipefail
cd "$(dirname "$0")"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

[ -f .env.deploy ] && source .env.deploy
: "${SSH_HOST:?set SSH_HOST in .env.deploy}"
: "${SSH_USER:?set SSH_USER in .env.deploy}"
: "${REMOTE_DIR:?set REMOTE_DIR in .env.deploy}"
SSH_PORT="${SSH_PORT:-22}"
BRANCH="${BRANCH:-main}"

# ── 1. Local sanity: what's deployed is origin/$BRANCH, so it must hold your work
echo "▸ Checking local repo…"
git fetch -q origin "$BRANCH"
if [ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ]; then
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "✗ Uncommitted changes on $BRANCH — commit and push first."; exit 1
  fi
  if [ -n "$(git log --oneline "origin/$BRANCH..HEAD")" ]; then
    echo "✗ Local $BRANCH has unpushed commits — run 'git push' first:"
    git log --oneline "origin/$BRANCH..HEAD"; exit 1
  fi
else
  echo "  (on branch $(git rev-parse --abbrev-ref HEAD) — deploying origin/$BRANCH regardless)"
fi
echo "  origin/$BRANCH = $(git log -1 --format='%h %s' "origin/$BRANCH")"

# ── 2. Remote: one ssh session does the rest
echo "▸ Connecting to $SSH_USER@$SSH_HOST…"
ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" \
  "REMOTE_DIR=$(printf %q "$REMOTE_DIR") BRANCH=$(printf %q "$BRANCH") DRY_RUN=$DRY_RUN bash -s" <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

git fetch -q origin "$BRANCH"
BEFORE=$(git rev-parse --short HEAD)
echo "  server is at: $(git log -1 --format='%h %s (%cd)' --date=short)"

INCOMING=$(git log --oneline "HEAD..origin/$BRANCH")
if [ -z "$INCOMING" ]; then
  echo "✓ Server is already up to date — nothing to deploy."; exit 0
fi
echo "  incoming commits:"; echo "$INCOMING" | sed 's/^/    /'

# Hand-edited tracked files on the server would block (or be lost in) the pull.
# Never stash automatically: they may hold server-only settings (ports, etc.).
DIRTY=$(git status --porcelain --untracked-files=no)
if [ -n "$DIRTY" ]; then
  echo "✗ The server checkout has local changes to tracked files:"
  echo "$DIRTY" | sed 's/^/    /'
  git diff --stat | sed 's/^/    /'
  echo "  Resolve once by hand (see README → Deploying to Strato), e.g.:"
  echo "    ssh … ; cd $REMOTE_DIR ; git diff      # inspect"
  echo "    git stash ; git pull ; git stash show -p   # then drop or pop"
  exit 1
fi

if [ "$DRY_RUN" = 1 ]; then echo "✓ Dry run — nothing changed."; exit 0; fi

# Consistent DB snapshot via SQLite's online backup (a plain cp can miss WAL data)
mkdir -p backups
SNAP="backups/pre-deploy_$(date +%Y%m%d_%H%M%S)_$BEFORE.db"
if docker exec portfolio-backend-v3 node -e \
     "require('better-sqlite3')('/app/data/portfolio.db').backup('/app/data/.pre-deploy.db').then(()=>process.exit(0),e=>{console.error(e.message);process.exit(1)})" \
   && mv data/.pre-deploy.db "$SNAP"; then
  gzip "$SNAP"; echo "✓ DB backup: $SNAP.gz"
else
  echo "✗ DB backup failed — aborting before touching anything."; exit 1
fi

echo "▸ Pulling…"
git merge -q --ff-only "origin/$BRANCH"
echo "▸ Building and restarting containers (takes a minute)…"
$DC up -d --build 2>&1 | tail -5

echo "▸ Waiting for health checks…"
for i in $(seq 1 60); do
  B=$(docker inspect -f '{{.State.Health.Status}}' portfolio-backend-v3 2>/dev/null || echo missing)
  F=$(docker inspect -f '{{.State.Health.Status}}' portfolio-frontend-v3 2>/dev/null || echo missing)
  [ "$B" = healthy ] && [ "$F" = healthy ] && break
  sleep 3
done
if [ "$B" != healthy ] || [ "$F" != healthy ]; then
  echo "✗ Not healthy after 3 min (backend: $B, frontend: $F). Logs: $DC logs --tail=50"
  echo "  Roll back:  cd $REMOTE_DIR && git checkout $BEFORE && $DC up -d --build"
  exit 1
fi
echo "✓ Deployed $BEFORE → $(git rev-parse --short HEAD), both containers healthy."
REMOTE

# ── 3. Check from the outside
if [ "$DRY_RUN" = 0 ] && [ -n "${PUBLIC_URL:-}" ]; then
  echo "▸ Checking $PUBLIC_URL…"
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$PUBLIC_URL/api/health" || true)
  if [ "$code" = 200 ]; then echo "✓ $PUBLIC_URL is up. Hard-reload the browser (Cmd+Shift+R)."
  else echo "✗ $PUBLIC_URL/api/health returned $code"; exit 1; fi
fi
