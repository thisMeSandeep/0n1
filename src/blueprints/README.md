# Blueprints

A blueprint is a pre-designed system shipped with 0n1. Each one is a single
JSON file in [`catalog/`](./catalog), named after its id
(`catalog/url-shortener.json`). Opening a blueprint always makes a copy in the
user's library, so the blueprint itself never changes.

## Format

```jsonc
{
  "format": "0n1-blueprint",
  "version": 1,
  "id": "url-shortener",          // kebab-case, the same as the file name; never rename it
  "title": "URL shortener",       // up to 60 characters
  "summary": "Read-heavy: …",     // one line for lists, up to 120 characters
  "description": "…",             // a short paragraph shown with the system
  "experiments": ["…", "…"],      // things to try, in order, as plain sentences
  "order": 1,                     // optional: lower comes first in lists
  "system": {
    "schemaVersion": 1,           // the system document's schema version
    "nodes": [
      { "id": "users", "type": "client", "name": "Users",
        "position": { "x": 56, "y": 328 }, "params": { "rate": 200 } }
    ],
    "edges": [{ "id": "users-lb", "source": "users", "target": "lb" }]
  }
}
```

- `type` is a component type from `src/components/` (`client`, `load-balancer`,
  `service`, …).
- `params` can be partial: missing settings take the component's defaults.
- Keep component names short; they show on the canvas.
- Write experiments the way you'd say them to someone next to you. Name the
  controls exactly as the lab shows them ("Set Traffic to 1000%").

## Checks

`bun run test` checks every blueprint. Each must be valid, be named after its
id, and compile into a runnable system with no errors or warnings. CI runs the
same checks on every pull request.
