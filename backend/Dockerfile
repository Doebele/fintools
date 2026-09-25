FROM node:22-alpine

# tzdata so the TZ env var (set in docker-compose.yml) actually takes effect
RUN apk add --no-cache tzdata

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install deps first (layer cache). Native modules (better-sqlite3, bcrypt) may
# have no prebuilt binary for this Node/musl/arch combo, so the compilers are
# installed for this step only and removed again in the same layer.
COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm install --omit=dev && npm cache clean --force \
 && apk del .build-deps

# Copy source
COPY server.js .
COPY static/ ./static/

# Create data dir with correct ownership
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health',(r)=>{process.exit(r.statusCode===200?0:1)})"

CMD ["node", "server.js"]
