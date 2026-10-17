/* @refresh reload */
import "@fontsource-variable/outfit";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { render } from "solid-js/web";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) throw new Error("Root element was not found.");

render(() => <App />, root);
