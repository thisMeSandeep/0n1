# 0n1

**Build it. Load it. Break it.**

0n1 is an open-source system design lab that runs entirely in your browser. Drag components onto a canvas, wire them up, push traffic through, and watch where the system breaks and why.

No backend, no account, no tracking. Everything you build stays in your browser.

After your first visit it works offline, and your browser can install it as an app.

> Early development. See [`docs/`](./docs) for the idea, stack, UI/UX and implementation plan.

## Run locally

Requires [Bun](https://bun.sh) and Node.js 24 (see `.nvmrc`).

```sh
bun install
bun run dev
```

| Script | What it does |
|---|---|
| `bun run dev` | Start the dev server |
| `bun run build` | Typecheck and build static files into `dist/` |
| `bun run preview` | Serve the production build locally |
| `bun run typecheck` | Run TypeScript |
| `bun run lint` | Lint and check formatting (Biome) |
| `bun run format` | Fix formatting and lint issues where possible |
| `bun run test` | Run unit tests (Vitest) |
| `bun run test:e2e` | Run end-to-end tests (Playwright) |

The first time you run end-to-end tests, install the browser:

```sh
bunx playwright install chromium
```

Tests in `*.build.spec.ts` (offline use, installing, updates) run against a production build, since only that has a service worker. Playwright builds it for them.

The app icons in `public/` are rendered from `public/favicon.svg`. After changing it, run `bun scripts/make-icons.mjs`.

## License

[MIT](./LICENSE), except the vendor icons in `public/vendor-icons/`. Those belong to Amazon Web Services, Microsoft and Google, are included unchanged for drawing architecture diagrams, and aren't covered by the MIT licence: see [`public/vendor-icons/NOTICE.md`](./public/vendor-icons/NOTICE.md). 0n1 isn't affiliated with any of them.

To change which vendor icons are included, put the vendors' icon packs in `vendor-icon-packs/` (git-ignored) and run `bun scripts/copy-vendor-icons.ts`.
