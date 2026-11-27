export {};

/**
 * Cuts a safe, immutable SemVer release tag (`vX.Y.Z`) from a clean, up-to-date `main`.
 *
 * Usage:
 *   bun run release:tag v0.2.0
 *   bun run release:tag v0.2.0 --push
 */
const args = process.argv.slice(2);
const tag = args.find((arg) => !arg.startsWith("-"));
const shouldPush = args.includes("--push");

const SEMVER_TAG =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/;

if (!tag || !SEMVER_TAG.test(tag)) {
  console.error(
    "Usage: bun run release:tag vX.Y.Z [--push]\nExample: bun run release:tag v0.2.0 --push",
  );
  process.exit(1);
}

const git = (gitArgs: readonly string[]) => {
  const res = Bun.spawnSync(["git", ...gitArgs], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    ok: res.exitCode === 0,
    stdout: res.stdout.toString("utf8").trim(),
    stderr: res.stderr.toString("utf8").trim(),
  };
};

const branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"]);
if (!branch.ok || branch.stdout !== "main") {
  console.error(
    `Release tags must be cut from 'main' (currently on '${branch.stdout || "detached HEAD"}').`,
  );
  process.exit(1);
}

const status = git(["status", "--porcelain"]);
if (!status.ok || status.stdout.length > 0) {
  console.error("Working tree is not clean. Commit or stash changes first.");
  process.exit(1);
}

const fetchRes = git(["fetch", "origin", "main", "--tags", "--quiet"]);
if (!fetchRes.ok) {
  console.error(`Failed to fetch origin/main: ${fetchRes.stderr}`);
  process.exit(1);
}

const head = git(["rev-parse", "HEAD"]).stdout;
const originMain = git(["rev-parse", "origin/main"]).stdout;
if (head !== originMain) {
  console.error(
    `Local main (${head.slice(0, 7)}) does not match origin/main (${originMain.slice(0, 7)}). Pull first.`,
  );
  process.exit(1);
}

if (git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]).ok) {
  console.error(`Tag ${tag} already exists.`);
  process.exit(1);
}

const create = git(["tag", "-a", tag, "-m", `Release ${tag}`]);
if (!create.ok) {
  console.error(`Failed to create tag ${tag}: ${create.stderr}`);
  process.exit(1);
}

console.log(`Created annotated tag ${tag} at ${head.slice(0, 7)}.`);

if (shouldPush) {
  const push = git(["push", "origin", tag]);
  if (!push.ok) {
    console.error(`Failed to push tag ${tag}: ${push.stderr}`);
    process.exit(1);
  }
  console.log(
    `Pushed ${tag} to origin — GitHub Actions release workflow will deploy to production.`,
  );
} else {
  console.log(`Run 'git push origin ${tag}' when ready to trigger production.`);
}
