// React entry point — mounts the root component into the DOM element defined in index.html.
// StrictMode intentionally double-invokes effects and renders in development to surface
// impure side-effects and unsafe lifecycle usage early. It has no impact in production builds.
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
