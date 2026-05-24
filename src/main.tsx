import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
import MainApp from "./App";
import CaptureApp from "./plugins/screenshot/capture/CaptureApp";
import PinApp from "./plugins/screenshot/capture/PinApp";

const label = getCurrentWindow().label;
const RoutedApp = label === "capture" ? CaptureApp : label.startsWith("pin") ? PinApp : MainApp;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RoutedApp />
  </React.StrictMode>,
);
