/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // An installable app that works offline after the first visit (S47).
    VitePWA({
      // A new version waits until the user chooses to reload (src/app/updates.ts).
      registerType: "prompt",
      injectRegister: false,
      // The precache glob below already has the icons.
      includeManifestIcons: false,
      manifest: {
        id: "/",
        name: "0n1",
        short_name: "0n1",
        description: "An open-source system design lab that runs in your browser.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // The light theme's surface; index.html sets the dark one for the browser's bar.
        theme_color: "#faf9f7",
        background_color: "#f4f3f0",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Everything the lab needs: the app, its lazy chunks (charts, image
        // export), the simulation worker and the fonts. Browsers with service
        // workers all read woff2, so the woff fallbacks stay out.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        // Take charge of a first visit's page too, so Reload works there when a new
        // version arrives. A first install never reloads; only an update does.
        clientsClaim: true,
      },
    }),
  ],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
