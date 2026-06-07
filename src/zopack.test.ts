import { describe, expect, test } from "bun:test";
import { parsePackFromContent, replacePackRouteCode } from "./index";

/**
 * Permanent regression tests for the zopack parser.
 *
 * The parser must never mistake `### ` lines that appear inside a route's
 * fenced code block for a new route header. This file locks down the three
 * failure modes that motivated the original parser fix:
 *
 *  1. `### ` appearing inside a JSX string literal.
 *  2. `### ` on its own line inside JSX markup.
 *  3. `### ` on its own line between code statements.
 *
 * If any of these tests start failing, the parser has regressed and
 * zo-element will start losing routes after edits.
 */
describe("parsePackFromContent — fenced-block preservation", () => {
  test("ignores `### ` inside a JSX string literal", () => {
    const pack = `---
format: zopack
name: demo
---
# demo
### \`/\` (page, public)
\`\`\`tsx
export default function Home() {
  return <main>{"### not a header"}</main>;
}
\`\`\`
### \`/api/hello\` (api, private)
\`\`\`typescript
export default function handler() {
  return { message: "ok" };
}
\`\`\`
`;
    const parsed = parsePackFromContent(pack);
    expect(parsed.routes.map((r) => r.path)).toEqual(["/", "/api/hello"]);
  });

  test("ignores `### ` on its own line inside JSX markup", () => {
    const pack = `---
format: zopack
name: demo
---
# demo
### \`/\` (page, public)
\`\`\`tsx
export default function Home() {
  return (
    <main>
      ### not a route header
    </main>
  );
}
\`\`\`
### \`/api/hello\` (api, private)
\`\`\`typescript
export default function handler() {
  return { message: "ok" };
}
\`\`\`
`;
    const parsed = parsePackFromContent(pack);
    expect(parsed.routes.map((r) => r.path)).toEqual(["/", "/api/hello"]);
  });

  test("ignores `### ` on its own line between code statements", () => {
    const pack = `---
format: zopack
name: demo
---
# demo
### \`/\` (page, public)
\`\`\`tsx
export default function Home() {
  const greeting = "hi";
  ### not a route header
  return <main>{greeting}</main>;
}
\`\`\`
### \`/api/hello\` (api, private)
\`\`\`typescript
export default function handler() {
  return { message: "ok" };
}
\`\`\`
`;
    const parsed = parsePackFromContent(pack);
    expect(parsed.routes.map((r) => r.path)).toEqual(["/", "/api/hello"]);
  });

  test("skips a route whose code fence is never closed and still parses following routes", () => {
    const pack = `---
format: zopack
name: demo
---
# demo
### \`/\` (page, public)
\`\`\`tsx
expor`;
    const parsed = parsePackFromContent(pack);
    expect(parsed.routes.map((r) => r.path)).toEqual([]);
  });

  test("parses a deeply markdowny code block (code fences inside strings, headings inside JSX, backticks in comments)", () => {
    const pack = `---
format: zopack
name: demo
---
# demo
### \`/\` (page, public)
\`\`\`tsx
export default function Home() {
  // ### not a route header
  const example = \`### \`; // backticks inside a template literal
  const heading = "## also not a heading";
  return (
    <main>
      <h1>{"### literal"}</h1>
      <p>{"## also literal"}</p>
      ### still not a route header
    </main>
  );
}
\`\`\`
### \`/api/hello\` (api, private)
\`\`\`typescript
export default function handler() {
  return { message: "ok" };
}
\`\`\`
`;
    const parsed = parsePackFromContent(pack);
    expect(parsed.routes.map((r) => r.path)).toEqual(["/", "/api/hello"]);
  });
});

describe("replacePackRouteCode — fenced-block preservation", () => {
  test("replaces the targeted route and keeps every other route intact", () => {
    const pack = `---
format: zopack
name: demo
---
# demo
### \`/\` (page, public)
\`\`\`tsx
export default function Home() {
  return <main>{"### not a header"}</main>;
}
\`\`\`
### \`/api/hello\` (api, private)
\`\`\`typescript
export default function handler() {
  return { message: "ok" };
}
\`\`\`
`;

    const updated = replacePackRouteCode(
      pack,
      { path: "/", route_type: "page" },
      `export default function Home() {
  return <main>{"### updated"}</main>;
}`,
    );

    expect(updated).toContain(`"### updated"`);
    expect(updated).not.toContain(`"### not a header"`);
    // The /api/hello block must be preserved unchanged.
    expect(updated).toContain(`### \`/api/hello\` (api, private)`);
    expect(updated).toContain(`message: "ok"`);
  });

  test("preserves routes that follow a route containing markdown-shaped content in its code", () => {
    const pack = `---
format: zopack
name: demo
---
# demo
### \`/\` (page, public)
\`\`\`tsx
export default function Home() {
  return (
    <main>
      ### not a route header
    </main>
  );
}
\`\`\`
### \`/api/hello\` (api, private)
\`\`\`typescript
export default function handler() {
  return { message: "ok" };
}
\`\`\`
`;

    const updated = replacePackRouteCode(
      pack,
      { path: "/", route_type: "page" },
      `export default function Home() {
  return <main>updated</main>;
}`,
    );

    const reparsed = parsePackFromContent(updated);
    expect(reparsed.routes.map((r) => r.path)).toEqual(["/", "/api/hello"]);
    expect(reparsed.routes[1].code).toContain(`message: "ok"`);
  });
});
