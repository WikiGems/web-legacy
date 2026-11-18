import { render } from "@solidjs/web";
import App from "./App";
import "./styles.css";
import { startRuntime } from "./runtime";

// Start the Effect runtime first, so lifecycle layers (install-prompt capture,
// storage sync) are live before the first render.
const stopRuntime = startRuntime();
if (import.meta.hot) import.meta.hot.dispose(stopRuntime);

const root = document.getElementById("root");
if (!root) throw new Error("Root element was not found.");
render(() => <App />, root);
