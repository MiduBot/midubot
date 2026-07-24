FROM oven/bun:1.3.12-slim

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .

CMD ["bun", "src/index.ts"]
