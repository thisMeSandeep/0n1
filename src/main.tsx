import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./ui/styles/global.css";

import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ThemeProvider } from "./ui/theme/ThemeProvider.tsx";
import { UIProvider } from "./ui/UIProvider.tsx";

// Dev-only primitives gallery at `?gallery`. `import.meta.env.DEV` is false in
// production builds, so the gallery chunk is never emitted.
const Gallery =
  import.meta.env.DEV && new URLSearchParams(location.search).has("gallery")
    ? lazy(() => import("./ui/gallery/Gallery.tsx"))
    : null;

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <UIProvider>
        {Gallery ? (
          <Suspense>
            <Gallery />
          </Suspense>
        ) : (
          <App />
        )}
      </UIProvider>
    </ThemeProvider>
  </StrictMode>,
);
