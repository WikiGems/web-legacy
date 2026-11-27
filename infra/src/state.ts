import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";

/**
 * Shared Alchemy state backend for WikiGems stacks.
 *
 * Uses Cloudflare's encrypted State Store by default so local runs and GitHub
 * Actions share one authoritative state. Set `ALCHEMY_STATE_STORE=local` only
 * for offline dry runs or local sandboxing.
 */
export const wikigemsState = () =>
  process.env.ALCHEMY_STATE_STORE === "local"
    ? Alchemy.localState()
    : Cloudflare.state({
        workerName:
          process.env.ALCHEMY_STATE_WORKER ?? "wikigems-alchemy-state",
      });
