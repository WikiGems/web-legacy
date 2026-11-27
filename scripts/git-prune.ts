export interface PrunedBranch {
  readonly branch: string;
  readonly reason: "merged" | "squash-merged" | "gone";
}

export interface KeptBranch {
  readonly branch: string;
  readonly reason: string;
}

export interface PruneOptions {
  readonly cwd?: string;
  readonly baseRef?: string;
  readonly dryRun?: boolean;
  readonly skipFetch?: boolean;
  readonly includeGone?: boolean;
}

export interface PruneResult {
  readonly baseRef: string;
  readonly deleted: readonly PrunedBranch[];
  readonly kept: readonly KeptBranch[];
}

const PROTECTED_BRANCHES = new Set(["main", "master"]);

const runGit = (
  args: readonly string[],
  cwd: string,
): {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
} => {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    ok: result.exitCode === 0,
    stdout: result.stdout.toString("utf8").trim(),
    stderr: result.stderr.toString("utf8").trim(),
  };
};

const refExists = (ref: string, cwd: string): boolean =>
  runGit(["rev-parse", "--verify", "--quiet", ref], cwd).ok;

const resolveBaseRef = (cwd: string, explicit?: string): string => {
  if (explicit) {
    if (!refExists(explicit, cwd)) {
      throw new Error(`Base ref does not exist: ${explicit}`);
    }
    return explicit;
  }
  for (const candidate of ["origin/main", "main", "origin/master", "master"]) {
    if (refExists(candidate, cwd)) {
      return candidate;
    }
  }
  throw new Error("Could not find base ref (tried origin/main, main, master).");
};

const getActiveWorktreeBranches = (cwd: string): Set<string> => {
  const result = runGit(["worktree", "list", "--porcelain"], cwd);
  const branches = new Set<string>();
  if (!result.ok) return branches;

  let currentBranch: string | undefined;
  let isPrunable = false;
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("branch refs/heads/")) {
      currentBranch = line.slice("branch refs/heads/".length);
    } else if (line.startsWith("prunable")) {
      isPrunable = true;
    } else if (line.trim() === "") {
      if (currentBranch && !isPrunable) {
        branches.add(currentBranch);
      }
      currentBranch = undefined;
      isPrunable = false;
    }
  }
  if (currentBranch && !isPrunable) {
    branches.add(currentBranch);
  }
  return branches;
};

const isSquashMerged = (
  branch: string,
  baseRef: string,
  cwd: string,
): boolean => {
  const branchTree = runGit(["rev-parse", `${branch}^{tree}`], cwd);
  const baseTree = runGit(["rev-parse", `${baseRef}^{tree}`], cwd);
  if (branchTree.ok && baseTree.ok && branchTree.stdout === baseTree.stdout) {
    return true;
  }

  const mergeBase = runGit(["merge-base", baseRef, branch], cwd);
  if (!mergeBase.ok || !branchTree.ok) return false;

  const syntheticCommit = runGit(
    ["commit-tree", branchTree.stdout, "-p", mergeBase.stdout, "-m", "_"],
    cwd,
  );
  if (!syntheticCommit.ok) return false;

  const cherry = runGit(["cherry", baseRef, syntheticCommit.stdout], cwd);
  return cherry.ok && cherry.stdout.startsWith("-");
};

export const pruneBranches = (options: PruneOptions = {}): PruneResult => {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const includeGone = options.includeGone ?? false;

  if (!options.skipFetch) {
    const remotes = runGit(["remote"], cwd);
    if (remotes.ok && remotes.stdout.length > 0) {
      runGit(["fetch", "--prune", "--quiet"], cwd);
    }
  }

  if (!dryRun) {
    runGit(["worktree", "prune"], cwd);
  }

  const baseRef = resolveBaseRef(cwd, options.baseRef);
  const currentHead = runGit(
    ["symbolic-ref", "--quiet", "--short", "HEAD"],
    cwd,
  );
  const currentBranch = currentHead.ok ? currentHead.stdout : undefined;
  const worktreeBranches = getActiveWorktreeBranches(cwd);

  const listed = runGit(
    [
      "for-each-ref",
      "--format=%(refname:short)\t%(upstream:track)",
      "refs/heads/",
    ],
    cwd,
  );
  if (!listed.ok) {
    throw new Error(`Failed to list local branches: ${listed.stderr}`);
  }

  const deleted: PrunedBranch[] = [];
  const kept: KeptBranch[] = [];

  for (const line of listed.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [branch, track = ""] = line.split("\t");
    if (!branch) continue;

    if (PROTECTED_BRANCHES.has(branch)) {
      kept.push({ branch, reason: "protected" });
      continue;
    }
    if (branch === currentBranch) {
      kept.push({ branch, reason: "current HEAD" });
      continue;
    }
    if (worktreeBranches.has(branch)) {
      kept.push({ branch, reason: "active worktree" });
      continue;
    }

    const isAncestor = runGit(
      ["merge-base", "--is-ancestor", branch, baseRef],
      cwd,
    ).ok;
    const isGone = track.includes("[gone]");

    let reason: PrunedBranch["reason"] | undefined;
    if (isAncestor) {
      reason = "merged";
    } else if (isSquashMerged(branch, baseRef, cwd)) {
      reason = "squash-merged";
    } else if (includeGone && isGone) {
      reason = "gone";
    }

    if (!reason) {
      kept.push({
        branch,
        reason: isGone
          ? "unmerged (remote gone; pass --include-gone to delete)"
          : "unmerged",
      });
      continue;
    }

    if (!dryRun) {
      const del = runGit(["branch", "-D", branch], cwd);
      if (!del.ok) {
        kept.push({ branch, reason: `delete failed: ${del.stderr}` });
        continue;
      }
    }
    deleted.push({ branch, reason });
  }

  return { baseRef, deleted, kept };
};

if (import.meta.main) {
  const args = process.argv.slice(2);
  let dryRun = false;
  let skipFetch = false;
  let includeGone = false;
  let baseRef: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run" || arg === "-n") {
      dryRun = true;
    } else if (arg === "--no-fetch") {
      skipFetch = true;
    } else if (arg === "--include-gone") {
      includeGone = true;
    } else if (arg === "--base") {
      baseRef = args[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: bun scripts/git-prune.ts [options]

Prune merged and squash-merged local branches + stale worktrees.

Options:
  -n, --dry-run       Show branches that would be deleted without deleting them
  --base <ref>        Base ref to compare against (default: origin/main or main)
  --include-gone      Also delete unmerged branches whose remote upstream is gone
  --no-fetch          Skip 'git fetch --prune' before checking branches
`);
      process.exit(0);
    } else {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  const result = pruneBranches({ baseRef, dryRun, skipFetch, includeGone });
  const prefix = dryRun ? "[dry-run] Would delete" : "Deleted";

  if (result.deleted.length === 0) {
    console.log(`No merged local branches to prune (base: ${result.baseRef}).`);
  } else {
    for (const item of result.deleted) {
      console.log(`${prefix} ${item.branch} (${item.reason})`);
    }
  }

  const unmerged = result.kept.filter(
    (item) => item.reason !== "protected" && item.reason !== "current HEAD",
  );
  if (unmerged.length > 0) {
    console.log("\nKept:");
    for (const item of unmerged) {
      console.log(`  - ${item.branch}: ${item.reason}`);
    }
  }
}
