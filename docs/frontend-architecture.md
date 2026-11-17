# React frontend and native boundary

The web app uses React 19, HeroUI 3, TanStack Router and TanStack Query. Vite still builds `dist/client`; the Cloudflare Worker, routes, APIs and PWA deployment contract remain the same.

## Current runtime

`src/index.tsx` mounts React in Strict Mode. `src/App.tsx` creates one query client and the web route tree. Public routes check the Better Auth session; an authenticated layout owns the navigation and protects the nine application routes. Page modules load on demand. Session failures provide a retry instead of redirecting a user whose session could not be checked.

`src/lib/auth-client.ts` binds Better Auth's React integration, browser passkeys and multiple sessions. Account changes currently navigate with a full reload, disposing the old query client, wallet connection and UI state. Private query keys additionally contain the user id. Do not persist authenticated caches across accounts.

HeroUI supplies cards, chips, alerts, avatars, progress bars, buttons, text fields, authentication tabs and dialogs. Tailwind utilities own responsive layout and spacing. `src/styles.css` contains only imports, font/accent setup and a few document defaults; the old page stylesheets and theme tokens are removed. Lucide supplies semantic icons. `WebDialog` owns web focus trapping, background scroll locking, Escape and outside-click dismissal. Pending wallet operations disable dismissal. Browser-only external stores use React's `useSyncExternalStore`; they contain wallet/UI state, never server data.

## Package ownership

| Location                               | Owns                                                                                                            | Native reuse                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `shared` / `@wikigems/domain`          | Effect schemas, account validation, card generation, featured data                                              | Directly reusable                       |
| `packages/client` / `@wikigems/client` | Injected HTTP client, response validation, cancellable query definitions, Wikipedia search                      | Directly reusable with native transport |
| `packages/contracts`                   | Existing marketplace/server contracts and precise USDC amounts                                                  | Directly reusable                       |
| `src`                                  | HeroUI web components, TanStack web routes, CSS, browser authentication, wallet injection, avatar resizing, PWA | Replace with native implementations     |
| `worker`, `apps/server`, `programs`    | Backend and on-chain operations                                                                                 | Consume over their existing boundaries  |

The domain and client packages import neither web UI nor browser globals. Their TypeScript library declarations include standard URL, fetch, Blob and abort types; these are also available in React Native. `bun run check:architecture` enforces the import and global boundaries and rejects Solid/StyleX dependencies.

## Chosen design

Two shapes were considered:

1. Share screens and primitives through a universal UI layer, choosing web or native implementations beneath it.
2. Share domain rules, validated HTTP operations and query definitions; let each platform own screens and device integrations.

The second shape preserves existing web behavior and keeps HeroUI's DOM components out of the future native dependency graph. A universal layer would need to standardize navigation, CSS layout, browser wallets, passkey prompts and image processing before native requirements are known. Avoid speculative native screens and platform adapters with no caller.

The original architecture already separates `shared` domain code from the Worker and browser code. This migration packages that existing separation, extracts the HTTP client and makes transport injection explicit. No new backend or authentication protocol is introduced.

## Client usage

```ts
import { createApiClient, createQueries, runApi } from "@wikigems/client";

const api = createApiClient({
  baseURL: "https://your-api.example",
  fetch: authenticatedFetch,
});
const queries = createQueries(api);

// Identical useQuery call in React web or React Native:
const profile = useQuery(queries.profile(userId));

// Mutations are explicit and never automatically retried:
await runApi(api.saveXHandle(handle, userId));
await queryClient.invalidateQueries({ queryKey: ["account", userId] });
```

Web binds `authenticatedFetch` to same-origin fetch with cookies. Native supplies an absolute API URL and a fetch wrapper implementing its chosen authentication/session transport. The client never reads a browser origin, cookie storage or environment variables. Effect cancellation propagates from TanStack Query to fetch; Wikipedia search also consumes the query signal. Errors and API error codes survive transport decoding.

## Adding the future native app

Create an `apps/native` workspace when native work begins. Depend on `@wikigems/domain`, `@wikigems/client`, React and TanStack Query. Provide native screens and navigation, and evaluate HeroUI Native independently of the web package.

Native integration still needs real implementation and device validation:

- Native Better Auth/passkey transport and secure session storage, with trusted origins and server authentication configured for that app.
- A native Solana wallet integration; browser-injected Phantom/Solflare/Backpack objects are not portable.
- Native image selection/resizing and avatar-upload transport.
- Query focus/online integration using AppState and network status.
- Deep links and authentication return URLs.

These are future platform requirements, not working native features. Do not import `src` from a shared package or a native app.

## Validation

Run `bun run typecheck`, `bun run check:workspaces`, `bun run check:architecture`, `bun test`, `bun run build` `bun run test:account` and `bun run test:components`. Component checks run in an isolated browser harness and cover modal focus, pack reveal, trade submission, wallet fallback and duel scoring. The account browser test uses disposable SQLite, isolated R2 and a virtual authenticator; it does not read production credentials. Preview marketplace, collection, wallet and action pages remain previews. Live mint, provider wallets, deployments and a native app require separate validation.

## Upstream references

- [HeroUI React setup](https://heroui.com/en/docs/react/getting-started/quick-start)
- [HeroUI modal composition](https://heroui.com/en/docs/react/components/modal)
- [TanStack Query on React Native](https://tanstack.com/query/latest/docs/framework/react/react-native)

## Responsive behavior checks

The account browser suite checks routes at widths of 320, 375, 768, 1024 and 1440 pixels. Below 1280 pixels, the navigation uses an expandable menu with every destination visible without horizontal scrolling. Coarse pointers receive 44-pixel button/tab targets and 16-pixel form text. Dialog content uses HeroUI's scrollable modal body so short viewports can reach every action.

The same suite opens a separate touch-enabled mobile context with the disposable account and checks orientation changes, live filters and empty-state recovery, modal dismissal, overlapping searches, long article titles and offline/reconnect feedback. The component browser suite taps through card, pack and trade dialogs at 320 by 568 pixels. These are browser-emulation checks, not physical-device or native-app certification.

## Web haptics

`src/lib/haptics.ts` binds the `web-haptics` browser library. It owns short semantic patterns (`selection`, `swap`, `buy`, `sell`, `confirm`, `success`, `warning`, `error`), the preference and hardware cleanup. No browser haptic dependency enters a portable package. A native app can implement the same semantic action names using its native haptics API.

`HapticButton` preserves HeroUI's button API and adds a `feedback` prop. Ordinary enabled buttons get a subtle selection tap; action buttons override the pattern. Navigation to Trade, Buy and Sell uses the corresponding patterns. Disabled marketplace previews remain disabled and silent. Feedback supplements visual status and never delays an action or implies a purchase succeeded.

Success/error toasts emit their outcome once through `showToast`. Inline account, passkey, wallet and mint errors emit at their handler; search observes new query errors with a ref to avoid repeated feedback on re-renders and Strict Mode effect replay.

Settings → Touch feedback controls a browser-local preference (`wikigems.haptics`). With no explicit choice, reduced motion defaults to no haptics. A saved choice takes precedence. Storage failures retain the current tab's choice. Disabling feedback, hiding the page, or unmounting cancels outstanding work and releases the library's resources. Audio debug feedback is always off. Unsupported or denied APIs never interrupt actions.

Glass surfaces use `src/components/LiquidGlass.tsx`, adapted from Aceternity UI's Liquid Glass: a Snell's-law displacement map (`src/lib/liquid-glass.ts`) refracts the live backdrop through an SVG filter used as `backdrop-filter`. Chromium refracts; WebKit (every iOS browser) and Gecko get frosted glass. The map is a `blob:` image, so the CSP allows `img-src blob:`. The mobile navigation bar, More menu and listing action pills use it. Settings → Liquid UI controls all of them. `src/lib/liquid-ui.ts` validates stored preferences under `wikigems.liquid-ui` and synchronizes changes across tabs. The default follows the device's reduced-transparency preference; an explicit choice takes precedence. Refraction sets displacement strength, blur sets frost (and the frosted fallback's blur), and opacity sets the body tint. Disabling liquid UI restores solid surfaces. Reset restores the original optics and device preference. Run `bun run test:settings` to verify navigation, live updates, persistence and storage failure handling.

Run `bun run test:haptics` for focused mobile-context checks without running the full account and layout suites. The account browser suite also includes these checks. It records calls at the vibration API boundary using the real library and asserts distinct swap/buy/sell patterns, press versus outcome patterns, disabled-button silence, preference persistence, reduced-motion defaults, and unavailable/refused API behavior. This verifies emitted requests rather than physical vibration. iOS fallback behavior and tactile feel need testing on the actual device/browser version; the web does not guarantee native-style haptics everywhere. See the [library documentation](https://github.com/lochie/web-haptics/blob/main/packages/web-haptics/README.md) and [Vibration API support and activation limits](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate).
