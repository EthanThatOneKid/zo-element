# zo-element

Drop-in live editing UI for Zo spaces backed by `.zopack.md` files.

The editor now uses a floating Pegasus indicator inspired by Next.js devtools: click it to open the panel, drag the indicator to a different corner, and the chosen corner is remembered in `localStorage`.

The goal is a Glitch/CodePen-style editing surface that can be imported into any Zo space. It reads route files from a zopack markdown file, lets the owner edit a route in-browser, sends the patch to the owner's Zo through `/zo/ask`, writes the updated `.zopack.md` back to disk when allowed, and refreshes when Zo confirms the edit.

## Install in a Zo space

Add a page route that renders the editor:

```tsx
import { ZoElement } from "zo-element";

export default function Page() {
  return <ZoElement packUrl="/Inbox/sample.zopack.md" />;
}
```

Add an API route that proxies the Zo request:

```ts
import type { Context } from "hono";
import { handleZoLiveEditRequest } from "zo-element";

export default async (c: Context) => handleZoLiveEditRequest(c);
```

Set `ZO_API_KEY` in Zo's Settings > Advanced secrets. The browser never receives the key; it only calls the same-origin API route.

If you want the edit to persist, point `packFilePath` at a writable file under `/home/workspace` and serve the current pack from a GET route such as `/api/zo-element-pack`.

### Securing the API route

By default the API route is open on the same origin. To require a bearer token, set `ZO_ELEMENT_API_SECRET` (also in Settings > Advanced) and include the header in requests:

```ts
fetch("/api/zopack-live-edit", {
  headers: { authorization: `Bearer ${secret}` },
  // ...rest of the request
});
```

The `isZoLiveEditAuthorized(c)` helper is exported for Hono middleware that wants to expose the same gate.

## API

### `ZoElement` / `ZopackLiveEditor`

Props:

- `packUrl`: URL to a `.zopack.md` file reachable from the page.
- `packMarkdown`: inline pack markdown, useful for static demos or tests.
- `packPath`: human-readable path included in the Zo edit prompt.
- `routePath`: compatibility alias for `packPath` in drop-in demos.
- `packFilePath`: writable workspace file path that receives the confirmed pack update.
- `apiPath`: same-origin API route. Defaults to `/api/zopack-live-edit`.
- `openLabel`: label used for the indicator button when the editor is closed.
- `className`: optional wrapper class.

### `handleZoLiveEditRequest(c)`

Hono handler for forwarding edit prompts to `https://api.zo.computer/zo/ask` using `process.env.ZO_API_KEY`.

### Lower-level helpers

- `parsePackFromContent(markdown)`
- `replacePackRouteCode(markdown, target, nextCode)`
- `buildZoLiveEditPrompt(args)`
- `resolveZopackStatus(args)`
- `describeZopackStatus(status)`

## Development

```bash
bun test
bun run typecheck
```
