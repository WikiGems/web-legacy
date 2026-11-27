import { resolveStageConfig } from "../src/stage";

interface WorkerVersion {
  readonly id: string;
  readonly number: number;
  readonly created_on?: string;
  readonly annotations?: {
    readonly "workers/tag"?: string;
    readonly "workers/message"?: string;
  };
}

interface WorkerDeployment {
  readonly id: string;
  readonly versions: readonly {
    readonly version_id: string;
    readonly percentage: number;
  }[];
}

const getArg = (flag: string): string | undefined =>
  process.argv
    .find((arg) => arg.startsWith(`${flag}=`))
    ?.slice(flag.length + 1);

const stageArg = getArg("--stage") ?? process.env.ALCHEMY_STAGE ?? "prod";
const explicitVersionId = getArg("--version-id")?.trim() || undefined;
const explicitTag = getArg("--tag")?.trim() || undefined;
const reason =
  getArg("--reason")?.trim() ||
  process.env.ROLLBACK_REASON?.trim() ||
  "Automated rollback";

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!accountId || !apiToken) {
  console.error(
    "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required to roll back a Worker.",
  );
  process.exit(1);
}

const stage = resolveStageConfig(stageArg);
const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(stage.workerName)}`;
const headers = {
  Authorization: `Bearer ${apiToken}`,
  "Content-Type": "application/json",
};

const cfFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const payload = (await res.json()) as {
    success?: boolean;
    result?: T;
    errors?: unknown[];
  };
  if (!res.ok || !payload.success || payload.result === undefined) {
    throw new Error(
      `Cloudflare API ${path} failed (${res.status}): ${JSON.stringify(payload.errors ?? payload)}`,
    );
  }
  return payload.result;
};

const [{ items: versions }, { deployments }] = await Promise.all([
  cfFetch<{ items: WorkerVersion[] }>("/versions?per_page=25"),
  cfFetch<{ deployments: WorkerDeployment[] }>("/deployments"),
]);

const activeVersionId = deployments[0]?.versions.reduce<string | undefined>(
  (best, entry) => (entry.percentage >= 50 ? entry.version_id : best),
  deployments[0]?.versions[0]?.version_id,
);

let target: WorkerVersion | undefined;
if (explicitVersionId) {
  target = versions.find((v) => v.id === explicitVersionId);
} else if (explicitTag) {
  target = versions.find((v) => v.annotations?.["workers/tag"] === explicitTag);
} else {
  // Most recent version that is not the currently active version.
  const sorted = [...versions].sort((a, b) => b.number - a.number);
  target = sorted.find((v) => v.id !== activeVersionId);
}

if (!target) {
  throw new Error(
    `Could not find a rollback target version for "${stage.workerName}" (active: ${activeVersionId ?? "none"}).`,
  );
}

console.log(
  `Rolling back "${stage.workerName}" from ${activeVersionId ?? "unknown"} -> ${target.id} (#${target.number}, tag: ${target.annotations?.["workers/tag"] ?? "none"})`,
);

await cfFetch("/deployments", {
  method: "POST",
  body: JSON.stringify({
    strategy: "percentage",
    versions: [{ version_id: target.id, percentage: 100 }],
    annotations: {
      "workers/message": `${reason} (rollback to #${target.number})`,
    },
  }),
});

console.log(
  `Rollback complete: 100% traffic routed to version ${target.id} (#${target.number}).`,
);
