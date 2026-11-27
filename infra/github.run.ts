import * as GitHub from "@alchemy.run/github";
import * as Alchemy from "alchemy";
import * as Output from "alchemy/Output";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import { wikigemsState } from "./src/state";

const GITHUB_ACTIONS_INTEGRATION_ID = 15368;

/**
 * GitHub repository governance as code (pure TypeScript + Effect).
 *
 * Reconciles:
 * - Repository merge & branch garbage-collection settings (`deleteBranchOnMerge`,
 *   linear squash/rebase merges, auto-merge).
 * - `protect-main` branch ruleset (single required `CI` gate, linear history,
 *   no force-push, no deletion, PR thread resolution).
 * - `protect-release-tags` tag ruleset (`refs/tags/v*` are immutable once cut).
 * - `preview` and `production` GitHub Actions deployment environments so secrets
 *   remain strictly isolated between PR previews and production releases.
 *
 * Deploy with `--adopt` on first run to import the existing repo and ruleset:
 *   bun run infra:github:deploy -- --adopt
 */
export default Alchemy.Stack(
  "wikigems-github",
  {
    providers: GitHub.providers(),
    state: wikigemsState(),
  },
  Effect.gen(function* () {
    const owner = yield* Config.String("GITHUB_REPO_OWNER").pipe(
      Config.withDefault("WikiGems"),
    );
    const repository = yield* Config.String("GITHUB_REPO_NAME").pipe(
      Config.withDefault("web-legacy"),
    );

    const repo = yield* GitHub.Repository("Repository", {
      owner,
      name: repository,
      description:
        "WikiGems — the Wikipedia trading card game. One article, one 1-of-1 card, minted on Solana.",
      visibility: "public",
      defaultBranch: "main",
      hasIssues: true,
      hasWiki: false,
      allowSquashMerge: true,
      allowRebaseMerge: true,
      allowMergeCommit: false,
      allowAutoMerge: true,
      deleteBranchOnMerge: true,
    }).pipe(Alchemy.RemovalPolicy.retain());

    // Reference `repo.fullName` so Alchemy orders rulesets and environments after repo reconciliation.
    const repoName = repo.fullName.pipe(
      Output.map((fullName) => fullName.split("/")[1] ?? repository),
    );

    const protectMain = yield* GitHub.Ruleset("ProtectMain", {
      owner,
      repository: repoName,
      name: "protect-main",
      target: "branch",
      enforcement: "active",
      conditions: {
        include: ["~DEFAULT_BRANCH"],
        exclude: [],
      },
      deletion: true,
      nonFastForward: true,
      requiredLinearHistory: true,
      pullRequest: {
        requiredApprovingReviewCount: 0,
        dismissStaleReviewsOnPush: true,
        requireCodeOwnerReview: false,
        requireLastPushApproval: false,
        requiredReviewThreadResolution: true,
        allowedMergeMethods: ["squash", "rebase"],
      },
      requiredStatusChecks: {
        strictRequiredStatusChecksPolicy: true,
        checks: [
          {
            context: "CI",
            integrationId: GITHUB_ACTIONS_INTEGRATION_ID,
          },
        ],
      },
    });

    const protectReleaseTags = yield* GitHub.Ruleset("ProtectReleaseTags", {
      owner,
      repository: repoName,
      name: "protect-release-tags",
      target: "tag",
      enforcement: "active",
      conditions: {
        include: ["refs/tags/v*"],
        exclude: [],
      },
      deletion: true,
      nonFastForward: true,
      update: true,
    });

    const previewEnv = yield* GitHub.Environment("PreviewEnvironment", {
      owner,
      repository: repoName,
      name: "preview",
    });

    const productionEnv = yield* GitHub.Environment("ProductionEnvironment", {
      owner,
      repository: repoName,
      name: "production",
    });

    return {
      repository: repo.fullName,
      mainRulesetId: protectMain.rulesetId,
      releaseTagRulesetId: protectReleaseTags.rulesetId,
      previewEnvironment: previewEnv.name,
      productionEnvironment: productionEnv.name,
    };
  }),
);
