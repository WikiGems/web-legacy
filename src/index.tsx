/* @refresh reload */
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/jetbrains-mono";
import { render } from "solid-js/web";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) throw new Error("Root element was not found.");

render(() => <App />, root);
