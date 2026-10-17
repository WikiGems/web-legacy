import { Route, Router } from "@solidjs/router";
import { AuthModal } from "./components/AuthModal";
import { ToastHost } from "./components/ToastHost";
import Desk from "./pages/Desk";
import Landing from "./pages/Landing";

function NotFound() {
  return (
    <main class="not-found shell">
      <p class="eyebrow">404 / OFF THE TAPE</p>
      <h1>This page is not in the wiki.</h1>
      <a class="btn btn-ink" href="/">
        Return to the desk
      </a>
    </main>
  );
}

export default function App() {
  return (
    <>
      <Router>
        <Route path="/" component={Landing} />
        <Route path="/desk" component={Desk} />
        <Route path="*" component={NotFound} />
      </Router>
      <AuthModal />
      <ToastHost />
    </>
  );
}
