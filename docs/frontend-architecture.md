# Solid frontend and native boundary

The web app uses Solid 2.0, TanStack Router (Solid, release candidate), DaisyUI on Tailwind 4, and Effect. Vite still builds `dist/client`; the Cloudflare Worker, routes, APIs and PWA deployment contract are unchanged.

## Runtime

`src/index.tsx` starts the Effect runtime, then renders `src/App.tsx` into `#root`. Public routes check the Better Auth session; an authenticated layout owns the navigation and protects the application routes. Page modules load on demand. A session that cannot be checked gets a retry instead of a redirect.

### Effect services

Every browser capability is an Effect service with a Layer, wired once in `src/runtime/runtime.ts` into a `ManagedRuntime`:

| Service | Owns |
| --- | --- |
| `Api` (`@wikigems/client`) | Validated HTTP operations over an injected transport |
| `Auth` | Better Auth session, passkey ceremonies, device accounts, email OTP |
| `Haptics` | Semantic patterns, preference, hardware and visibility cleanup |
| `LiquidUi` | Glass preferences, cross-tab storage sync, reduced transparency |
| `Wallet` | Injected Solana wallets, connect/sign/mint, wallet dialog state |
| `PwaInstall` | Install-prompt capture and the install/dismiss state machine |
| `Toasts` | Notification queue (plays the success/error haptic) |
| `Avatars` | Square crop and WebP encoding of a chosen picture |

State lives in `SubscriptionRef`s. Lifecycle listeners are `acquireRelease` resources, so they start with the runtime and are removed when it is disposed. Failures are typed (`ApiError`, `AuthError`, `WalletError`, `AvatarError`, `WikipediaError`) and reach the UI as values, never as unhandled rejections.

`src/runtime/solid.ts` is the bridge:

- `fromRef(ref)` follows a `SubscriptionRef` as a Solid accessor.
- `createAsync(() => effect)` is an async memo backed by an Effect. Reading it suspends the nearest `<Loading>`, a failure reaches `<Errored>`, and a changed input or disposed owner aborts the request (the signal reaches `fetch`). Read signals while *building* the Effect, not inside its generator, so they are tracked.
- `runUi(effect, onFailure)` runs an Effect from an event handler and resolves `{ ok, value }`. It never rejects.

`src/lib/*` keeps small facades (`haptic()`, `showToast()`, `useSession()`) over these services.

### Data

There is no query cache. Server data is an async memo owned by the component that needs it, refreshed with `refresh(memo)` after a write. Private data is requested for the current account only, and account changes still reload the page, disposing every memo, the wallet connection and UI state. Do not persist authenticated data across accounts.

### UI

DaisyUI supplies component classes (`btn`, `card`, `badge`, `alert`, `input`, `toggle`, `range`, `tabs`, `modal`); `src/styles.css` defines its light and dark themes and keeps the monochrome identity. `src/components/ui` holds thin Solid wrappers. `WebDialog` is a custom modal (focus trap, Escape and outside-click dismissal, scroll lock, `inert` page behind it, focus return, and no dismissal while an operation is pending); it is not a native `<dialog>` so toasts can sit above it. Icons are Lucide's plain icon data rendered as SVG. Browser-only stores contain wallet/UI state, never server data.

## Package ownership

| Location | Owns | Native reuse |
| --- | --- | --- |
| `shared` / `@wikigems/domain` | Effect schemas, account validation, card generation, featured data | Directly reusable |
| `packages/client` / `@wikigems/client` | `Api` service, response validation, cancellable operations, Wikipedia search | Directly reusable with native transport |
| `packages/contracts` | Marketplace/server contracts and precise USDC amounts | Directly reusable |
| `src` | Solid components, routes, CSS, Effect browser services, PWA | Replace with native implementations |
| `worker`, `apps/server`, `programs` | Backend and on-chain operations | Consume over their existing boundaries |

The domain and client packages import neither a UI framework nor browser globals; `bun run check:architecture` enforces this and rejects React and its UI/query libraries. The portable packages depend only on `effect`, so the native-app plan is now "share Effect services and schemas", not "share TanStack Query hooks"; a native app supplies its own screens (Solid-based or not) over `Api`.

## Client usage

```ts
import { Api } from "@wikigems/client";

// Once per platform:
const layer = Api.layer({ baseURL, fetch: authenticatedFetch });

// Anywhere:
const profile = Api.use((api) => api.fetchAccountProfile());
// Web: createAsync(() => profile), or runUi(profile, onFailure) in a handler.
```

Web binds `authenticatedFetch` to same-origin fetch with cookies. The client never reads a browser origin, cookie storage or environment variables. Interrupting the fiber aborts `fetch`.

## Validation

Run `bun run typecheck`, `bun run check:workspaces`, `bun run check:architecture`, `bun test`, `bun run build`, `bun run test:account` and `bun run test:components`. Component checks run in an isolated browser harness and cover modal focus, pack reveal, trade submission, wallet fallback and duel scoring. The account browser test uses disposable SQLite, isolated R2 and a virtual authenticator; it does not read production credentials. Preview marketplace, collection, wallet and action pages remain previews. Live mint, provider wallets, deployments and a native app require separate validation.

## Upstream references

- [Solid 2.0 migration guide](https://github.com/solidjs/solid/blob/main/documentation/solid-2.0/MIGRATION.md)
- [DaisyUI](https://daisyui.com/)
- [Effect](https://effect.website/)

## Responsive behavior checks

The account browser suite checks routes at widths of 320, 375, 768, 1024 and 1440 pixels. Below 1280 pixels, the navigation uses an expandable menu with every destination visible without horizontal scrolling. Coarse pointers receive 44-pixel button/tab targets and 16-pixel form text. Dialog content scrolls inside the modal so short viewports can reach every action.

The same suite opens a separate touch-enabled mobile context with the disposable account and checks orientation changes, live filters and empty-state recovery, modal dismissal, overlapping searches, long article titles and offline/reconnect feedback. The component browser suite taps through card, pack and trade dialogs at 320 by 568 pixels. These are browser-emulation checks, not physical-device or native-app certification.

## Web haptics

`src/lib/haptics.ts` binds the `web-haptics` browser library. It owns short semantic patterns (`selection`, `swap`, `buy`, `sell`, `confirm`, `success`, `warning`, `error`), the preference and hardware cleanup. No browser haptic dependency enters a portable package. A native app can implement the same semantic action names using its native haptics API.

`Button` (`src/components/ui/button.tsx`) adds a `feedback` prop. Ordinary enabled buttons get a subtle selection tap; action buttons override the pattern. Navigation to Trade, Buy and Sell uses the corresponding patterns. Disabled marketplace previews remain disabled and silent. Feedback supplements visual status and never delays an action or implies a purchase succeeded.

Success/error toasts emit their outcome once through `showToast`. Inline account, passkey, wallet and mint errors emit at their handler; search observes new query errors with a ref to avoid repeated feedback on re-renders and Strict Mode effect replay.

Settings → Touch feedback controls a browser-local preference (`wikigems.haptics`). With no explicit choice, reduced motion defaults to no haptics. A saved choice takes precedence. Storage failures retain the current tab's choice. Disabling feedback, hiding the page, or unmounting cancels outstanding work and releases the library's resources. Audio debug feedback is always off. Unsupported or denied APIs never interrupt actions.

Glass surfaces use `src/components/LiquidGlass.tsx`, adapted from Aceternity UI's Liquid Glass: a Snell's-law displacement map (`src/lib/liquid-glass.ts`) refracts the live backdrop through an SVG filter used as `backdrop-filter`. Chromium refracts; WebKit (every iOS browser) and Gecko get frosted glass. The map is a `blob:` image, so the CSP allows `img-src blob:`. The mobile navigation bar, More menu and listing action pills use it. Settings → Liquid UI controls all of them. `src/lib/liquid-ui.ts` validates stored preferences under `wikigems.liquid-ui` and synchronizes changes across tabs. The default follows the device's reduced-transparency preference; an explicit choice takes precedence. Refraction sets displacement strength, blur sets frost (and the frosted fallback's blur), and opacity sets the body tint. Disabling liquid UI restores solid surfaces. Reset restores the original optics and device preference. Run `bun run test:settings` to verify navigation, live updates, persistence and storage failure handling.

Run `bun run test:haptics` for focused mobile-context checks without running the full account and layout suites. The account browser suite also includes these checks. It records calls at the vibration API boundary using the real library and asserts distinct swap/buy/sell patterns, press versus outcome patterns, disabled-button silence, preference persistence, reduced-motion defaults, and unavailable/refused API behavior. This verifies emitted requests rather than physical vibration. iOS fallback behavior and tactile feel need testing on the actual device/browser version; the web does not guarantee native-style haptics everywhere. See the [library documentation](https://github.com/lochie/web-haptics/blob/main/packages/web-haptics/README.md) and [Vibration API support and activation limits](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate).
