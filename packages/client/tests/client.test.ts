import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { ApiError, createApiClient, runApi } from "../src/api";
import { createQueries } from "../src/queries";
import { searchWikipedia } from "../src/wikipedia";

const profile = {
  userId: "alice",
  username: "alice",
  xHandle: null,
  image: null,
};
function client(handler: (request: Request) => Response | Promise<Response>) {
  return createApiClient({
    baseURL: "https://api.example.test",
    fetch: (input, init) => Promise.resolve(handler(new Request(input, init))),
  });
}

describe("portable client", () => {
  test("uses the injected origin and preserves account ownership on writes", async () => {
    const requests: Request[] = [];
    const api = client((request) => {
      requests.push(request);
      return Response.json(profile);
    });
    expect(await runApi(api.fetchAccountProfile())).toEqual(profile);
    await runApi(api.reserveUsername("alice", "alice"));
    expect(requests[0]?.url).toBe("https://api.example.test/api/profile");
    expect(requests[1]?.headers.get("x-wikigems-account")).toBe("alice");
    expect(await requests[1]?.json()).toEqual({ username: "alice" });
  });

  test("rejects malformed successful responses and preserves API error detail", async () => {
    const malformed = client(() => Response.json({ userId: 42 }));
    await expect(runApi(malformed.fetchAccountProfile())).rejects.toThrow(
      "unexpected response",
    );
    const denied = client(() =>
      Response.json(
        { error: "Different account", code: "ACCOUNT_CHANGED" },
        { status: 409 },
      ),
    );
    await expect(runApi(denied.fetchAccountProfile())).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(runApi(denied.fetchAccountProfile())).rejects.toMatchObject({
      status: 409,
      code: "ACCOUNT_CHANGED",
      message: "Different account",
    });
  });

  test("separates account caches and disables queries without a session", async () => {
    const api = client(() => Response.json(profile));
    const queries = createQueries(api);
    expect(queries.profile("").enabled).toBe(false);
    const cache = new QueryClient();
    cache.setQueryData(queries.profile("alice").queryKey, profile);
    expect(cache.getQueryData(queries.profile("bob").queryKey)).toBeUndefined();
    expect(await cache.fetchQuery(queries.profile("alice"))).toEqual(profile);
    cache.clear();
  });

  test("query cancellation aborts the injected transport", async () => {
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let transportSignal: AbortSignal | undefined;
    const api = client(
      (request) =>
        new Promise<Response>((_resolve, reject) => {
          transportSignal = request.signal;
          request.signal.addEventListener(
            "abort",
            () => reject(request.signal.reason),
            { once: true },
          );
          started();
        }),
    );
    const cache = new QueryClient();
    const options = createQueries(api).profile("alice");
    const pending = cache.fetchQuery(options).catch(() => undefined);
    await requestStarted;
    await cache.cancelQueries({ queryKey: options.queryKey });
    await pending;
    expect(transportSignal?.aborted).toBe(true);
    expect(cache.getQueryData(options.queryKey)).toBeUndefined();
    cache.clear();
  });

  test("validates Wikipedia results, sorts rank and passes cancellation", async () => {
    const controller = new AbortController();
    const result = await searchWikipedia({
      term: "Moon",
      signal: controller.signal,
      fetch: async function (this: void, input, init) {
        expect(this).toBeUndefined();
        expect(String(input)).toContain("gsrsearch=Moon");
        expect(init?.signal).toBe(controller.signal);
        return Response.json({
          query: {
            pages: {
              second: { pageid: 2, title: "Moon landing", index: 2 },
              first: {
                pageid: 1,
                title: "Moon",
                index: 1,
                extract: "Earth's satellite",
              },
            },
          },
        });
      },
    });
    expect(result.map((article) => article.title)).toEqual([
      "Moon",
      "Moon landing",
    ]);
    await expect(
      searchWikipedia({
        term: "Moon",
        fetch: async () =>
          Response.json({ query: { pages: { invalid: { title: "Moon" } } } }),
      }),
    ).rejects.toThrow();
  });
});
