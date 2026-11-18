import { createSignal, createUniqueId, Show } from "solid-js";
import {
  dismissInstallOffer,
  installPlatform,
  requestPwaInstall,
  usePwaInstall,
} from "../lib/pwa-install";
import { Icon } from "./Icon";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { WebDialog } from "./WebDialog";

const hidden = (kind: string) =>
  ["unavailable", "installed", "accepted"].includes(kind);

export function InstallAppButton() {
  const install = usePwaInstall();
  const [instructions, setInstructions] = createSignal(false);
  const titleId = createUniqueId();
  const kind = () => install().availability.kind;
  return (
    <Show when={!hidden(kind())}>
      <Button
        variant="secondary"
        pending={kind() === "prompting"}
        onClick={() => {
          if (kind() === "ready")
            void requestPwaInstall().then((result) => {
              if (result === "manual") setInstructions(true);
            });
          else setInstructions(true);
        }}
      >
        <Icon name="download" size={16} />
        {kind() === "ready" || kind() === "prompting"
          ? "Install app"
          : "How to install"}
      </Button>
      <Show when={instructions()}>
        <WebDialog labelId={titleId} onClose={() => setInstructions(false)}>
          <div class="flex items-start justify-between gap-3">
            <h2 id={titleId} class="text-2xl font-semibold">
              Install WikiGems
            </h2>
            <Button
              iconOnly
              variant="ghost"
              aria-label="Close installation instructions"
              onClick={() => setInstructions(false)}
            >
              <Icon name="close" />
            </Button>
          </div>
          <p class="text-sm leading-relaxed text-muted">
            {installPlatform() === "ios"
              ? "Open your browser’s Share menu, choose Add to Home Screen, then tap Add. If Open as Web App appears, leave it enabled."
              : installPlatform() === "mac-safari"
                ? "In Safari, choose File → Add to Dock, then click Add."
                : "Open your browser’s menu and choose Install WikiGems or Install page as app. You can also use the install icon in the address bar when it appears. If your browser has no install option, open this page in Chrome, Edge, or Safari."}
          </p>
          <p class="text-xs text-muted">
            The app opens in its own window. Sign-in, card syncing, trading, and
            minting need an internet connection.
          </p>
          <Button onClick={() => setInstructions(false)}>Got it</Button>
        </WebDialog>
      </Show>
    </Show>
  );
}

export function PwaInstallOffer() {
  const install = usePwaInstall();
  return (
    <Show
      when={!install().dismissed && !hidden(install().availability.kind)}
    >
      <aside
        aria-label="Install WikiGems"
        class="border-b border-base-300 bg-base-200"
      >
        <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <div class="flex min-w-0 items-center gap-3">
            <img
              src="/icons/gem-192.png"
              width={40}
              height={40}
              alt=""
              class="size-10 shrink-0 rounded-xl grayscale"
            />
            <div>
              <p class="text-sm font-semibold">Install WikiGems</p>
              <p class="text-xs text-muted">Your collection, one tap away.</p>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <InstallAppButton />
            <Button variant="ghost" onClick={dismissInstallOffer}>
              Not now
            </Button>
          </div>
        </div>
      </aside>
    </Show>
  );
}

export function PwaInstallSettings() {
  const install = usePwaInstall();
  return (
    <Show when={!hidden(install().availability.kind)}>
      <Card>
        <CardHeader>
          <CardTitle>Install WikiGems</CardTitle>
          <CardDescription>
            Open your collection from your home screen or desktop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InstallAppButton />
        </CardContent>
      </Card>
    </Show>
  );
}
