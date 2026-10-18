import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./ui/styles/global.css";

import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { startUpdates } from "./app/registerUpdates.ts";
import { saveThemePreference, startStorage } from "./storage/index.ts";
import { readThemeMirror } from "./storage/preferences.ts";
import { ThemeProvider } from "./ui/theme/ThemeProvider.tsx";
import { UIProvider } from "./ui/UIProvider.tsx";

// Dev-only primitives gallery at `?gallery`. `import.meta.env.DEV` is false in
// production builds, so the gallery chunk is never emitted.
const Gallery =
  import.meta.env.DEV && new URLSearchParams(location.search).has("gallery")
    ? lazy(() => import("./ui/gallery/Gallery.tsx"))
    : null;

// Dev-only: `?sample` opens the mockup's URL shortener without touching storage
// (`?sample=large`: 30 components, for performance checks).
// Excluded from production builds.
let initialTheme = readThemeMirror() ?? "system";
if (import.meta.env.DEV && new URLSearchParams(location.search).has("sample")) {
  const [{ sampleSystem, largeSampleSystem }, { designStore }] = await Promise.all([
    import("./canvas/sample.ts"),
    import("./store/index.ts"),
  ]);
  const large = new URLSearchParams(location.search).get("sample") === "large";
  designStore.getState().load(large ? largeSampleSystem() : sampleSystem());
} else if (!Gallery) {
  // Reopen the last system and preferences from this browser before the first paint.
  initialTheme = await startStorage();
}

// Works offline and can be installed (S47). Dev servers have no service worker.
if (import.meta.env.PROD) startUpdates();

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider initialPreference={initialTheme} onPreferenceChange={saveThemePreference}>
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
