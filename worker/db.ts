import { Kysely } from "kysely";
import { LibsqlDialect } from "@libsql/kysely-libsql";
import type { Env } from "./env";

export interface WatchlistTable {
  id: string;
  userId: string;
  entryId: string;
  createdAt: number;
}

export interface Database {
  watchlist: WatchlistTable;
}

export function createDb(env: Pick<Env, "TURSO_DATABASE_URL" | "TURSO_AUTH_TOKEN">) {
  return new Kysely<Database>({
    dialect: new LibsqlDialect({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN || undefined,
    }),
  });
}
