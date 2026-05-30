# zo-element

Drop-in live editing UI for Zo spaces backed by `.zopack.md` files.

The goal is a Glitch/CodePen-style side panel that can be imported into any Zo space. It reads route files from a zopack markdown file, lets the owner edit a route in-browser, sends the patch to the owner's Zo through `/zo/ask`, and refreshes when Zo confirms the edit.

## Install in a Zo space

Add a page route that renders the editor:

```tsx
import { ZopackLiveEditor } from "zo-element/live-editor";

export default function Page() {
  return <ZopackLiveEditor packUrl="/Inbox/sample.zopack.md" />;
}
```

Add an API route that proxies the Zo request:

```ts
import type { Context } from "hono";
import { handleZoLiveEditRequest } from "zo-element";

export default async (c: Context) => handleZoLiveEditRequest(c);
```

Set `ZO_API_KEY` in Zo's Settings > Advanced secrets. The browser never receives the key; it only calls the same-origin API route.

## API

### `ZopackLiveEditor`

Props:

- `packUrl`: URL to a `.zopack.md` file reachable from the page.
- `packMarkdown`: inline pack markdown, useful for static demos or tests.
- `packPath`: human-readable path included in the Zo edit prompt.
- `apiPath`: same-origin API route. Defaults to `/api/zopack-live-edit`.
- `openLabel`: text for the floating editor button.
- `className`: optional wrapper class.

### `handleZoLiveEditRequest(c)`

Hono handler for forwarding edit prompts to `https://api.zo.computer/zo/ask` using `process.env.ZO_API_KEY`.

### Lower-level helpers

- `parsePackFromContent(markdown)`
- `replacePackRouteCode(markdown, target, nextCode)`
- `buildZoLiveEditPrompt(args)`

## Development

```bash
bun install
bun test
bun run typecheck
```
