import { useHapticsLifecycle } from "./lib/haptics";
import { useLiquidUiLifecycle } from "./lib/liquid-ui";
import { Page } from "./components/Page";
import { SystemTheme } from "./components/SystemTheme";
import { lazy, Suspense, type PropsWithChildren } from "react";
import { Spinner } from "@heroui/react";
import { HapticButton as Button } from "./components/HapticButton";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
} from "@tanstack/react-router";

import { Nav } from "./components/Nav";
import { OfflineNotice } from "./components/OfflineNotice";
import { ToastHost } from "./components/ToastHost";
import { PwaInstallOffer } from "./components/PwaInstall";
import { useUi } from "./lib/ui";
import { authClient } from "./lib/auth-client";

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
  const { walletModalOpen } = useUi();
  return walletModalOpen ? (
    <Suspense fallback={null}>
      <WalletModal />
    </Suspense>
  ) : null;
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: false },
    mutations: { retry: false },
  },
});

function Loading() {
  return (
    <main
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-sm text-muted"
      role="status"
    >
      <Spinner />
      <p>Loading your archive…</p>
    </main>
  );
}

function SiteFrame({
  children,
  signedIn = false,
}: PropsWithChildren<{ signedIn?: boolean }>) {
  if (!signedIn)
    return (
      <>
        <PwaInstallOffer />
        {children}
      </>
    );
  return (
    <div className="app-shell">
      <Nav />
      <div className="app-content">
        <PwaInstallOffer />
        {children}
      </div>
    </div>
  );
}

function SessionGate({
  children,
  signedIn = true,
}: PropsWithChildren<{ signedIn?: boolean }>) {
  const session = authClient.useSession();
  if (session.isPending)
    return (
      <SiteFrame>
        <Loading />
      </SiteFrame>
    );
  if (session.error)
    return (
      <SiteFrame>
        <Page className="space-y-4" role="alert">
          <p>Your session could not be checked.</p>
          <Button onPress={() => void session.refetch()}>Try again</Button>
        </Page>
      </SiteFrame>
    );
  if (Boolean(session.data?.user) !== signedIn)
    return <Navigate to={signedIn ? "/login" : "/play"} replace />;
  return <SiteFrame signedIn={signedIn}>{children}</SiteFrame>;
}

function Login() {
  const search = useSearch({ from: "/login" });
  return search.add === 1 ? (
    <SiteFrame>
      <AuthPage />
    </SiteFrame>
  ) : (
    <SessionGate signedIn={false}>
      <AuthPage />
    </SessionGate>
  );
}

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
      <OfflineNotice />
      <WalletOverlay />
      <ToastHost />
    </>
  ),
  errorComponent: ({ reset }) => (
    <SiteFrame>
      <Page className="space-y-4" role="alert">
        <h1 className="text-3xl font-semibold">
          The page could not be loaded.
        </h1>
        <Button onPress={reset}>Try again</Button>
      </Page>
    </SiteFrame>
  ),
  notFoundComponent: () => (
    <SiteFrame>
      <Page className="space-y-5 py-24">
        <p className="text-sm font-medium text-accent">404 / Torn page</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          This article is missing from the archive.
        </h1>
        <Link to="/" className="button button--secondary w-fit">
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
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
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
  defaultPendingComponent: Loading,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  useHapticsLifecycle();
  useLiquidUiLifecycle();
  return (
    <QueryClientProvider client={queryClient}>
      <SystemTheme />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
