# 0n1

**Build it. Load it. Break it.**

0n1 is an open-source system design lab that runs entirely in your browser. Drag components onto a canvas, wire them up, push traffic through, and watch where the system breaks and why.

No backend, no account, no tracking. Everything you build stays in your browser.

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

## License

[MIT](./LICENSE)
