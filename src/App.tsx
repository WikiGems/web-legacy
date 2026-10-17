import { Route, Router } from "@solidjs/router";
import { AuthModal } from "./components/AuthModal";
import { ToastHost } from "./components/ToastHost";
import { WalletModal } from "./components/WalletModal";
import Landing from "./pages/Landing";
import Play from "./pages/Play";

function NotFound() {
  return (
    <main class="not-found page-shell">
      <p class="eyebrow">404 / TORN PAGE</p>
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
        <Route path="/" component={Landing} />
        <Route path="/play" component={Play} />
        <Route path="*" component={NotFound} />
      </Router>
      <AuthModal />
      <WalletModal />
      <ToastHost />
    </>
  );
}
