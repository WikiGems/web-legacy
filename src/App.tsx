import { Navigate, Route, Router } from "@solidjs/router";
import { Show, type ParentProps } from "solid-js";
import { AuthPage } from "./components/AuthPage";
import { OfflineNotice } from "./components/OfflineNotice";
import { ToastHost } from "./components/ToastHost";
import { WalletModal } from "./components/WalletModal";
import Landing from "./pages/Landing";
import Play from "./pages/Play";
import Trade from "./pages/Trade";
import Sell from "./pages/Sell";
import Buy from "./pages/Buy";
import Wallet from "./pages/Wallet";
import Action from "./pages/Action";
import Collection from "./pages/Collection";
import { Nav } from "./components/Nav";
import { authClient } from "./lib/auth-client";

function CheckingSession() {
  return (
    <main class="play-loading" role="status">
      <span class="spinner" aria-hidden="true" />
      <p class="mono">Checking your session…</p>
    </main>
  );
}

function SignedOutPage(props: ParentProps) {
  const session = authClient.useSession();

  return (
    <Show when={!session().isPending} fallback={<CheckingSession />}>
      <Show when={!session().data?.user} fallback={<Navigate href="/play" />}>
        {props.children}
      </Show>
    </Show>
  );
}

function ProtectedPage(props: ParentProps) {
  const session = authClient.useSession();

  return (
    <Show when={!session().isPending} fallback={<CheckingSession />}>
      <Show when={session().data?.user} fallback={<Navigate href="/login" />}>
        <Nav />
        {props.children}
      </Show>
    </Show>
  );
}

function NotFound() {
  return (
    <main class="not-found page-shell">
      <p class="eyebrow">404 / Torn page</p>
      <h1>This article is missing from the archive.</h1>
      <a class="btn btn-primary" href="/">
        Return to the library
      </a>
    </main>
  );
}

export default function App() {
  return (
    <>
      <Router>
        <Route
          path="/"
          component={() => (
            <SignedOutPage>
              <Landing />
            </SignedOutPage>
          )}
        />
        <Route
          path="/play"
          component={() => (
            <ProtectedPage>
              <Play />
            </ProtectedPage>
          )}
        />
        <Route
          path="/trade"
          component={() => (
            <ProtectedPage>
              <Trade />
            </ProtectedPage>
          )}
        />
        <Route
          path="/buy"
          component={() => (
            <ProtectedPage>
              <Buy />
            </ProtectedPage>
          )}
        />
        <Route
          path="/sell"
          component={() => (
            <ProtectedPage>
              <Sell />
            </ProtectedPage>
          )}
        />
        <Route
          path="/action"
          component={() => (
            <ProtectedPage>
              <Action />
            </ProtectedPage>
          )}
        />
        <Route
          path="/collection"
          component={() => (
            <ProtectedPage>
              <Collection />
            </ProtectedPage>
          )}
        />
        <Route
          path="/wallet"
          component={() => (
            <ProtectedPage>
              <Wallet />
            </ProtectedPage>
          )}
        />
        <Route
          path="/login"
          component={() => (
            <SignedOutPage>
              <AuthPage />
            </SignedOutPage>
          )}
        />
        <Route path="*" component={NotFound} />
      </Router>
      <OfflineNotice />
      <WalletModal />
      <ToastHost />
    </>
  );
}
