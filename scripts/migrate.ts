import { readdir, readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL ?? "http://127.0.0.1:8080";
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
const client = createClient({ url, authToken });

const migrationFiles = (await readdir("migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort();

await client.execute(`
  create table if not exists "_wikigems_migrations" (
    "name" text not null primary key,
    "appliedAt" integer not null
  )
`);

const applied = new Set(
  (
    await client.execute('select "name" from "_wikigems_migrations" order by "name"')
  ).rows.map((row) => String(row.name)),
);

let count = 0;
for (const file of migrationFiles) {
  if (applied.has(file)) {
    console.log(`↷ ${file} (already applied)`);
    continue;
  }

  const sql = await readFile(`migrations/${file}`, "utf8");
  console.log(`→ applying ${file}`);
  await client.executeMultiple(sql);
  await client.execute({
    sql: 'insert into "_wikigems_migrations" ("name", "appliedAt") values (?, ?)',
    args: [file, Date.now()],
  });
  count += 1;
}

console.log(count === 0 ? "Database is up to date." : `Applied ${count} migration(s).`);
console.log(`Database: ${url}`);
client.close();
