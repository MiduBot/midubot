let ready = false;

export function markHealthy(): void {
  ready = true;
}

export function markUnhealthy(): void {
  ready = false;
}

export function isHealthy(): boolean {
  return ready;
}

/** Pure status for /health — testable without Bun.serve. */
export function healthResponse(): Response {
  if (ready) {
    return new Response("ok", { status: 200 });
  }
  return new Response("starting", { status: 503 });
}

export function startHealthServer(port: number): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    port,
    fetch(req) {
      const path = new URL(req.url).pathname;
      if (path === "/health" || path === "/") {
        return healthResponse();
      }
      return new Response("not found", { status: 404 });
    },
  });
}
