FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    gdb \
    bubblewrap \
    util-linux \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 tracer \
    && useradd --uid 1001 --gid 1001 --create-home --shell /usr/sbin/nologin tracer

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
    && chown -R tracer:tracer /app

ENV NODE_ENV=production
ENV PORT=3000
ENV TRUST_PROXY=1

USER tracer

EXPOSE 3000

CMD ["npm", "start"]
