import { handleRequest } from "./app";

const port = Number(Bun.env.WIKIGEMS_SERVER_PORT ?? "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("WIKIGEMS_SERVER_PORT must be an integer between 1 and 65535");
}
const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: handleRequest });
console.info(`WikiGems server listening at ${server.url}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => { void server.stop(); });
}
