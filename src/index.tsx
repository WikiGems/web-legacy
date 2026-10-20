/* @refresh reload */
import { render } from "solid-js/web";
import * as stylex from "@stylexjs/stylex";
import App from "./App";
import { systemTheme } from "./theme";
import "./styles.css";

const root = document.getElementById("root");

if (!root) throw new Error("Root element was not found.");

const { className: themeClasses } = stylex.props(systemTheme);
if (themeClasses)
  document.documentElement.classList.add(...themeClasses.split(/\s+/));
render(() => <App />, root);
