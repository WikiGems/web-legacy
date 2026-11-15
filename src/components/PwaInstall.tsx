import { useId, useState } from "react";
import { Card } from "@heroui/react";
import { HapticButton as Button } from "./HapticButton";
import { WebDialog } from "./WebDialog";
import { Icon } from "./Icon";
import {
  dismissInstallOffer,
  installPlatform,
  requestPwaInstall,
  usePwaInstall,
} from "../lib/pwa-install";

export function InstallAppButton() {
  const { availability } = usePwaInstall();
  const [instructions, setInstructions] = useState(false);
  const titleId = useId();
  if (["unavailable", "installed", "accepted"].includes(availability.kind))
    return null;
  const platform = installPlatform();
  return (
    <>
      <Button
        variant="secondary"
        isPending={availability.kind === "prompting"}
        isDisabled={availability.kind === "prompting"}
        onPress={() => {
          if (availability.kind === "ready")
            void requestPwaInstall().then((result) => {
              if (result === "manual") setInstructions(true);
            });
          else setInstructions(true);
        }}
      >
        <Icon name="download" size={16} />
        {availability.kind === "ready" || availability.kind === "prompting"
          ? "Install app"
          : "How to install"}
      </Button>
      {instructions && (
        <WebDialog labelId={titleId} onClose={() => setInstructions(false)}>
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-2xl font-semibold">
              Install WikiGems
            </h2>
            <Button
              isIconOnly
              variant="ghost"
              aria-label="Close installation instructions"
              onPress={() => setInstructions(false)}
            >
              <Icon name="close" />
            </Button>
          </div>
          {platform === "ios" ? (
            <p className="text-sm leading-relaxed text-muted">
              Open your browser’s Share menu, choose Add to Home Screen, then
              tap Add. If Open as Web App appears, leave it enabled.
            </p>
          ) : platform === "mac-safari" ? (
            <p className="text-sm leading-relaxed text-muted">
              In Safari, choose File → Add to Dock, then click Add.
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              Open your browser’s menu and choose Install WikiGems or Install
              page as app. You can also use the install icon in the address bar
              when it appears. If your browser has no install option, open this
              page in Chrome, Edge, or Safari.
            </p>
          )}
          <p className="text-xs text-muted">
            The app opens in its own window. Sign-in, card syncing, trading, and
            minting need an internet connection.
          </p>
          <Button onPress={() => setInstructions(false)}>Got it</Button>
        </WebDialog>
      )}
    </>
  );
}

export function PwaInstallOffer() {
  const { availability, dismissed } = usePwaInstall();
  if (
    dismissed ||
    ["unavailable", "accepted", "installed"].includes(availability.kind)
  )
    return null;
  return (
    <aside
      aria-label="Install WikiGems"
      className="border-b border-separator bg-surface"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/icons/gem-192.png"
            width={40}
            height={40}
            alt=""
            className="size-10 shrink-0 rounded-xl grayscale"
          />
          <div>
            <p className="text-sm font-semibold">Install WikiGems</p>
            <p className="text-xs text-muted">Your collection, one tap away.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <InstallAppButton />
          <Button variant="ghost" onPress={dismissInstallOffer}>
            Not now
          </Button>
        </div>
      </div>
    </aside>
  );
}

export function PwaInstallSettings() {
  const { availability } = usePwaInstall();
  if (["unavailable", "accepted", "installed"].includes(availability.kind))
    return null;
  return (
    <Card>
      <Card.Header>
        <Card.Title>Install WikiGems</Card.Title>
        <Card.Description>
          Open your collection from your home screen or desktop.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <InstallAppButton />
      </Card.Content>
    </Card>
  );
}
