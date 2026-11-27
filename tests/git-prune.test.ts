import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pruneBranches } from "../scripts/git-prune";

const tempDirs: string[] = [];

const git = (cwd: string, args: readonly string[]) => {
  const res = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "WikiGems Test",
      GIT_AUTHOR_EMAIL: "test@wikigems.invalid",
      GIT_COMMITTER_NAME: "WikiGems Test",
      GIT_COMMITTER_EMAIL: "test@wikigems.invalid",
    },
  });
  if (res.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${res.stderr.toString("utf8")}`,
    );
  }
  return res.stdout.toString("utf8").trim();
};

const createRepo = () => {
  const dir = mkdtempSync(join(tmpdir(), "wikigems-git-prune-"));
  tempDirs.push(dir);
  git(dir, ["init", "-b", "main"]);
  writeFileSync(join(dir, "README.md"), "init\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "initial"]);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("git-prune", () => {
  it("prunes regular merged and squash-merged branches while preserving unmerged branches", () => {
    const repo = createRepo();

    // 1. Regular merge branch
    git(repo, ["checkout", "-b", "feat/regular"]);
    writeFileSync(join(repo, "regular.txt"), "regular\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "add regular"]);
    git(repo, ["checkout", "main"]);
    git(repo, ["merge", "--no-ff", "feat/regular", "-m", "merge regular"]);

    // 2. Squash-merged branch (multiple commits, squashed onto main)
    git(repo, ["checkout", "-b", "feat/squashed"]);
    writeFileSync(join(repo, "squash-a.txt"), "a\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "squash part 1"]);
    writeFileSync(join(repo, "squash-b.txt"), "b\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "squash part 2"]);
    git(repo, ["checkout", "main"]);
    git(repo, ["merge", "--squash", "feat/squashed"]);
    git(repo, ["commit", "-m", "feat: squashed (#10)"]);

    // 3. Unmerged work-in-progress branch (must NEVER be deleted)
    git(repo, ["checkout", "-b", "feat/wip"]);
    writeFileSync(join(repo, "wip.txt"), "do not delete\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-m", "wip"]);
    git(repo, ["checkout", "main"]);

    // Dry run reports without deleting
    const dry = pruneBranches({
      cwd: repo,
      baseRef: "main",
      dryRun: true,
      skipFetch: true,
    });
    expect(dry.deleted).toEqual([
      { branch: "feat/regular", reason: "merged" },
      { branch: "feat/squashed", reason: "squash-merged" },
    ]);
    expect(git(repo, ["branch", "--list", "feat/squashed"])).toContain(
      "feat/squashed",
    );

    // Real run deletes merged + squash-merged, keeps feat/wip and main
    const actual = pruneBranches({
      cwd: repo,
      baseRef: "main",
      skipFetch: true,
    });
    expect(actual.deleted).toEqual([
      { branch: "feat/regular", reason: "merged" },
      { branch: "feat/squashed", reason: "squash-merged" },
    ]);
    expect(actual.kept).toContainEqual({
      branch: "feat/wip",
      reason: "unmerged",
    });

    const remaining = git(repo, [
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads/",
    ])
      .split("\n")
      .sort();
    expect(remaining).toEqual(["feat/wip", "main"]);
  });
});
