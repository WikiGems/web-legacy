import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFile } from "node:fs/promises";

test("the R2 migration erases old pictures and preserves usernames and X links", async () => {
  const db = new Database(":memory:");
  try {
    for (const file of [
      "000_better_auth.sql",
      "001_game.sql",
      "002_account_profiles.sql",
    ]) {
      db.exec(await readFile(`migrations/${file}`, "utf8"));
    }
    db.run(
      "insert into user (id, name, email, emailVerified, image, createdAt, updatedAt) values (?, ?, ?, 1, ?, ?, ?)",
      [
        "alice",
        "Alice",
        "alice@example.com",
        "/api/profile/avatar/alice?v=old",
        Date.now(),
        Date.now(),
      ],
    );
    db.run(
      "insert into account_profiles (userId, username, xHandle, avatarData, avatarMime, avatarVersion) values (?, ?, ?, ?, ?, ?)",
      ["alice", "alice_1", "alice_x", "old-picture-data", "image/png", "old"],
    );
    db.exec(await readFile("migrations/003_r2_avatars.sql", "utf8"));
    expect(db.query("select * from account_profiles").get()).toEqual({
      userId: "alice",
      username: "alice_1",
      xHandle: "alice_x",
      avatarKey: null,
    });
    expect(db.query("select image from user").get()).toEqual({ image: null });
    expect(db.query("select * from avatar_cleanup").all()).toEqual([]);
    expect(() =>
      db
        .query(
          "select avatarData, avatarMime, avatarVersion from account_profiles",
        )
        .all(),
    ).toThrow();
    expect(() =>
      db.run("insert into account_profiles (userId, username) values (?, ?)", [
        "another",
        "ALICE_1",
      ]),
    ).toThrow();
  } finally {
    db.close();
  }
});
