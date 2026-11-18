import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { Api, ApiError, createApiClient, runApi } from "../src/api";
import { searchWikipedia, searchWikipediaEffect } from "../src/wikipedia";

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

  test("provides the client as an Effect service over the injected transport", async () => {
    const requests: Request[] = [];
    const layer = Api.layer({
      baseURL: "https://api.example.test",
      fetch: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(Response.json(profile));
      },
    });
    const result = await Effect.runPromise(
      Api.use((api) => api.fetchAccountProfile()).pipe(Effect.provide(layer)),
    );
    expect(result).toEqual(profile);
    expect(requests[0]?.url).toBe("https://api.example.test/api/profile");
  });

  test("interrupting a request aborts the injected transport", async () => {
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
    const controller = new AbortController();
    const pending = runApi(api.fetchAccountProfile(), {
      signal: controller.signal,
    }).catch(() => undefined);
    await requestStarted;
    controller.abort();
    await pending;
    expect(transportSignal?.aborted).toBe(true);
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

  test("wraps Wikipedia failures in a typed error", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(
        searchWikipediaEffect({
          term: "Moon",
          fetch: async () => new Response("nope", { status: 500 }),
        }),
      ),
    );
    expect(failure._tag).toBe("WikipediaError");
    expect(failure.message).toContain("unavailable");
  });
});
