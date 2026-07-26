FROM oven/bun:1.3.12-slim

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

# Ready only after Discord clientReady (GET /health → 200).
HEALTHCHECK --interval=5s --timeout=3s --start-period=45s --retries=5 \
  CMD bun -e "const p=process.env.HEALTH_PORT||'3000';fetch('http://127.0.0.1:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "src/index.ts"]
