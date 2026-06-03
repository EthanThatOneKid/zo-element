import { describe, expect, test } from "bun:test";
import { buildZoLiveEditPrompt, parsePackFromContent, replacePackRouteCode } from "./index";

const PACK = `---
format: zopack
version: "1.0"
name: sample
author: etok.zo.computer
routes: 2
exported: 2026-05-29
---

# sample

## Routes

### \`/\` (page, public)

\`\`\`tsx
export default function Home() {
  return <main>hello</main>;
}
\`\`\`

### \`/api/hello\` (api, private)

\`\`\`typescript
export default async function handler(c) {
  return c.json({ message: "hello" });
}
\`\`\`
`;

describe("parsePackFromContent", () => {
  test("parses route files from a zopack markdown file", () => {
    const pack = parsePackFromContent(PACK);
    expect(pack.meta.name).toBe("sample");
    expect(pack.routes.map((route) => route.path)).toEqual(["/", "/api/hello"]);
    expect(pack.routes[0].route_type).toBe("page");
  });
});

describe("replacePackRouteCode", () => {
  test("updates a single route block and preserves the rest of the pack", () => {
    const next = replacePackRouteCode(PACK, { path: "/api/hello", route_type: "api" }, `export default async function handler(c) {
  return c.json({ message: "updated" });
}`);

    expect(next).toContain(`message: "updated"`);
    expect(next).toContain(`return <main>hello</main>;`);
    expect(next).toContain(`### \`/\` (page, public)`);
  });
});

describe("buildZoLiveEditPrompt", () => {
  test("describes the pack file and route clearly", () => {
    const prompt = buildZoLiveEditPrompt({
      packName: "sample",
      packPath: "Inbox/sample.zopack.md",
      target: { path: "/api/hello", route_type: "api" },
      beforeCode: `export default async function handler(c) {
  return c.json({ message: "hello" });
}`,
      afterCode: `export default async function handler(c) {
  return c.json({ message: "updated" });
}`,
      updatedPackMarkdown: PACK.replace("hello", "updated"),
    });

    expect(prompt).toContain("sample");
    expect(prompt).toContain("Inbox/sample.zopack.md");
    expect(prompt).toContain("/api/hello");
    expect(prompt).toContain(`message: "updated"`);
    expect(prompt).toContain("Expected updated pack markdown");
  });
});
