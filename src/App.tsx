import { lazy, Loading, Match, Show, Switch, type ParentProps } from "solid-js";
import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Link,
  Navigate,
  Outlet,
  RouterProvider,
  useSearch,
} from "@tanstack/solid-router";
import { Nav } from "./components/Nav";
import { OfflineNotice } from "./components/OfflineNotice";
import { Page } from "./components/Page";
import { PwaInstallOffer } from "./components/PwaInstall";
import { SystemTheme } from "./components/SystemTheme";
import { ToastHost } from "./components/ToastHost";
import { Button, buttonClass } from "./components/ui/button";
import { Spinner } from "./components/ui/feedback";
import { refreshSession, useSession } from "./lib/session";
import { useWalletState } from "./lib/ui";

const AuthPage = lazy(() =>
  import("./components/AuthPage").then((module) => ({
    default: module.AuthPage,
  })),
);
const WalletModal = lazy(() =>
  import("./components/WalletModal").then((module) => ({
    default: module.WalletModal,
  })),
);
function WalletOverlay() {
  const wallet = useWalletState();
  return (
    <Show when={wallet().modalOpen}>
      <Loading fallback={null}>
        <WalletModal />
      </Loading>
    </Show>
  );
}

const Landing = lazyRouteComponent(() => import("./pages/Landing"));
const Play = lazyRouteComponent(() => import("./pages/Play"));
const Trade = lazyRouteComponent(() => import("./pages/Trade"));
const Buy = lazyRouteComponent(() => import("./pages/Buy"));
const Sell = lazyRouteComponent(() => import("./pages/Sell"));
const Action = lazyRouteComponent(() => import("./pages/Action"));
const Collection = lazyRouteComponent(() => import("./pages/Collection"));
const Wallet = lazyRouteComponent(() => import("./pages/Wallet"));
const Account = lazyRouteComponent(() => import("./pages/Account"));
const Settings = lazyRouteComponent(() => import("./pages/Settings"));
const Bid = lazyRouteComponent(() => import("./pages/Bid"));
const CreateAuction = lazyRouteComponent(() => import("./pages/CreateAuction"));
const VerifyEmail = lazyRouteComponent(() => import("./pages/VerifyEmail"));

function PageLoading() {
  return (
    <main
      class="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-sm text-muted"
      role="status"
    >
      <Spinner size="md" />
      <p>Loading your archive…</p>
    </main>
  );
}

function SiteFrame(props: ParentProps<{ signedIn?: boolean }>) {
  return (
    <Show
      when={props.signedIn}
      fallback={
        <>
          <PwaInstallOffer />
          {props.children}
        </>
      }
    >
      <div class="app-shell">
        <Nav />
        <div class="app-content">
          <PwaInstallOffer />
          {props.children}
        </div>
      </div>
    </Show>
  );
}

/** Admits only the audience a route is for, and redirects everyone else. */
function SessionGate(props: ParentProps<{ signedIn?: boolean }>) {
  const session = useSession();
  const signedIn = () => props.signedIn ?? true;
  return (
    <Switch>
      <Match when={session().pending}>
        <SiteFrame>
          <PageLoading />
        </SiteFrame>
      </Match>
      {/* A session that cannot be checked gets a retry, not a redirect. */}
      <Match when={session().failed}>
        <SiteFrame>
          <Page class="space-y-4" role="alert">
            <p>Your session could not be checked.</p>
            <Button onClick={() => void refreshSession()}>Try again</Button>
          </Page>
        </SiteFrame>
      </Match>
      <Match when={Boolean(session().data?.user) !== signedIn()}>
        <Navigate to={signedIn() ? "/login" : "/play"} replace />
      </Match>
      <Match when={true}>
        <SiteFrame signedIn={signedIn()}>{props.children}</SiteFrame>
      </Match>
    </Switch>
  );
}

function Login() {
  const search = useSearch({ from: "/login" });
  // Adding an account is for signed-in users, so it skips the gate.
  return (
    <Show
      when={search().add === 1}
      fallback={
        <SessionGate signedIn={false}>
          <AuthPage />
        </SessionGate>
      }
    >
      <SiteFrame>
        <AuthPage />
      </SiteFrame>
    </Show>
  );
}

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Loading fallback={<PageLoading />}>
        <Outlet />
      </Loading>
      <OfflineNotice />
      <WalletOverlay />
      <ToastHost />
    </>
  ),
  errorComponent: ({ reset }) => (
    <SiteFrame>
      <Page class="space-y-4" role="alert">
        <h1 class="text-3xl font-semibold">The page could not be loaded.</h1>
        <Button onClick={reset}>Try again</Button>
      </Page>
    </SiteFrame>
  ),
  notFoundComponent: () => (
    <SiteFrame>
      <Page class="space-y-5 py-24">
        <p class="text-sm font-medium text-primary">404 / Torn page</p>
        <h1 class="text-3xl font-semibold tracking-tight">
          This article is missing from the archive.
        </h1>
        <Link to="/" class={[buttonClass("secondary"), "w-fit"].join(" ")}>
          Return to the library
        </Link>
      </Page>
    </SiteFrame>
  ),
});
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <SessionGate signedIn={false}>
      <Landing />
    </SessionGate>
  ),
});
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (
    search: Record<string, unknown>,
  ): { mode?: "signup" | "signin"; add?: 1 } => ({
    mode:
      search.mode === "signup"
        ? "signup"
        : search.mode === "signin"
          ? "signin"
          : undefined,
    add: search.add === 1 || search.add === "1" ? 1 : undefined,
  }),
  component: Login,
});
const protectedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  component: () => (
    <SessionGate>
      <Loading fallback={<PageLoading />}>
        <Outlet />
      </Loading>
    </SessionGate>
  ),
});
const routes = [
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/auctions/new",
    component: CreateAuction,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/auctions/$auctionId",
    component: Bid,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/play",
    component: Play,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/trade",
    component: Trade,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/buy",
    component: Buy,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/sell",
    component: Sell,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/action",
    component: Action,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/collection",
    component: Collection,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/wallet",
    component: Wallet,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/account",
    component: Account,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/settings",
    component: Settings,
  }),
  createRoute({
    getParentRoute: () => protectedRoute,
    path: "/account/verify-email",
    component: VerifyEmail,
  }),
];
export const router = createRouter({
  routeTree: rootRoute.addChildren([
    homeRoute,
    loginRoute,
    protectedRoute.addChildren(routes),
  ]),
  scrollRestoration: true,
  defaultPreload: "intent",
  defaultPendingComponent: PageLoading,
});
declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <>
      <SystemTheme />
      <RouterProvider router={router} />
    </>
  );
}
