import { describe, it, expect, beforeEach } from "bun:test";
import {
  healthResponse,
  isHealthy,
  markHealthy,
  markUnhealthy,
} from "@/core/health";

describe("health", () => {
  beforeEach(() => {
    markUnhealthy();
  });

  it("is unhealthy until marked ready", () => {
    expect(isHealthy()).toBe(false);
    expect(healthResponse().status).toBe(503);
  });

  it("returns 200 after markHealthy", () => {
    markHealthy();
    expect(isHealthy()).toBe(true);
    expect(healthResponse().status).toBe(200);
  });

  it("returns to 503 after markUnhealthy", () => {
    markHealthy();
    markUnhealthy();
    expect(healthResponse().status).toBe(503);
  });
});
