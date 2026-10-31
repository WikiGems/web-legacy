import { Effect } from "effect";
import { FoundationServices, Listings } from "./services";

// A separate HTTP boundary; no imports from the legacy app or worker.
export const handleRequest = (request: Request): Promise<Response> => {
  const program = Effect.gen(function* () {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") {
      return Response.json({ service: "wikigems-server", status: "foundation", ready: false });
    }
    if (request.method === "GET" && path === "/v1/listings") {
      const service = yield* Listings;
      const listings = yield* service.list();
      return Response.json({ listings });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  }).pipe(
    Effect.catchTag("NotImplemented", () => Effect.succeed(
      Response.json({ error: "Service not implemented" }, { status: 501 }),
    )),
    Effect.provide(FoundationServices),
  );
  return Effect.runPromise(program);
};
