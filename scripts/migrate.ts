import { readdir, readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";

export interface MigrationOptions {
  readonly url: string;
  readonly authToken?: string;
  readonly migrationsDir?: string;
  readonly quiet?: boolean;
}

export interface MigrationSummary {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
  readonly url: string;
}

export async function runMigrations(
  options: MigrationOptions,
): Promise<MigrationSummary> {
  const migrationsDir = options.migrationsDir ?? "migrations";
  const client = createClient({
    url: options.url,
    authToken: options.authToken || undefined,
  });

  try {
    const migrationFiles = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .sort();

    await client.execute(`
      create table if not exists "_wikigems_migrations" (
        "name" text not null primary key,
        "appliedAt" integer not null
      )
    `);

    const existing = new Set(
      (
        await client.execute(
          'select "name" from "_wikigems_migrations" order by "name"',
        )
      ).rows.map((row) => String(row.name)),
    );

    const applied: string[] = [];
    const skipped: string[] = [];

    for (const file of migrationFiles) {
      if (existing.has(file)) {
        skipped.push(file);
        if (!options.quiet) console.log(`↷ ${file} (already applied)`);
        continue;
      }

      const sql = await readFile(`${migrationsDir}/${file}`, "utf8");
      if (!options.quiet) console.log(`→ applying ${file}`);
      await client.executeMultiple(sql);
      await client.execute({
        sql: 'insert into "_wikigems_migrations" ("name", "appliedAt") values (?, ?)',
        args: [file, Date.now()],
      });
      applied.push(file);
    }

    if (!options.quiet) {
      console.log(
        applied.length === 0
          ? "Database is up to date."
          : `Applied ${applied.length} migration(s).`,
      );
      console.log(`Database: ${options.url}`);
    }

    return { applied, skipped, url: options.url };
  } finally {
    client.close();
  }
}

if (import.meta.main) {
  const url = process.env.TURSO_DATABASE_URL ?? "http://127.0.0.1:8080";
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  await runMigrations({ url, authToken });
}
