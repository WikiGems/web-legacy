import { describe, expect, test } from "bun:test";
import { handleRequest } from "./app";

describe("foundation HTTP boundary", () => {
  test("reports liveness without claiming business readiness", async () => {
    const response = await handleRequest(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "wikigems-server", status: "foundation", ready: false });
  });
  test("does not return fictional listings when no adapter is configured", async () => {
    const response = await handleRequest(new Request("http://localhost/v1/listings"));
    expect(response.status).toBe(501);
    expect(await response.json()).toEqual({ error: "Service not implemented" });
  });
  test("unknown paths and write operations are not exposed", async () => {
    for (const [path, method] of [["/unknown", "GET"], ["/v1/listings", "POST"], ["/health", "POST"]]) {
      const response = await handleRequest(new Request(`http://localhost${path}`, { method }));
      expect(response.status).toBe(404);
    }
  });
});
