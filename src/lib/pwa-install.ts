import { Effect } from "effect";
import { fromRef, getService } from "../runtime";
import { PwaInstall } from "../services/pwa-install";

export { installPlatform } from "../services/pwa-install";

export const usePwaInstall = () => fromRef(getService(PwaInstall).state);
export const dismissInstallOffer = () =>
  Effect.runSync(getService(PwaInstall).dismissOffer);
export const requestPwaInstall = () =>
  Effect.runPromise(getService(PwaInstall).request);
