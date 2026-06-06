import { describe, expect, test } from "bun:test";
import {
  buildZoLiveEditPrompt,
  describeZopackStatus,
  parsePackFromContent,
  replacePackRouteCode,
  resolveZopackStatus,
} from "./index";

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
    const next = replacePackRouteCode(
      PACK,
      { path: "/api/hello", route_type: "api" },
      `export default async function handler(c) {
  return c.json({ message: "updated" });
}`,
    );

    expect(next).toContain(`message: "updated"`);
    expect(next).toContain(`return <main>hello</main>;`);
    expect(next).toContain(`### \`/\` (page, public)`);
    expect(next).toContain("```typescript\nexport default async function handler(c) {\n  return c.json({ message: \"updated\" });\n}\n```");
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

describe("describeZopackStatus", () => {
  test("maps status states to badge metadata", () => {
    expect(describeZopackStatus("idle")).toEqual({ label: "Idle", color: "#64748b", pulse: false });
    expect(describeZopackStatus("loading")).toEqual({ label: "Loading", color: "#d8a657", pulse: true });
    expect(describeZopackStatus("error")).toEqual({ label: "Error", color: "#dc2626", pulse: false });
  });
});

describe("resolveZopackStatus", () => {
  test("prioritizes loading, saving, and error states", () => {
    expect(
      resolveZopackStatus({
        hasInlinePack: false,
        hasPackUrl: true,
        rawMarkdown: "",
        loadError: null,
        parsedPack: null,
        running: false,
        error: null,
      }),
    ).toBe("loading");

    expect(
      resolveZopackStatus({
        hasInlinePack: true,
        hasPackUrl: false,
        rawMarkdown: PACK,
        loadError: null,
        parsedPack: parsePackFromContent(PACK),
        running: false,
        error: null,
      }),
    ).toBe("ready");

    expect(
      resolveZopackStatus({
        hasInlinePack: true,
        hasPackUrl: false,
        rawMarkdown: PACK,
        loadError: null,
        parsedPack: parsePackFromContent(PACK),
        running: true,
        error: null,
      }),
    ).toBe("saving");

    expect(
      resolveZopackStatus({
        hasInlinePack: true,
        hasPackUrl: false,
        rawMarkdown: PACK,
        loadError: null,
        parsedPack: { error: "bad markdown" },
        running: false,
        error: null,
      }),
    ).toBe("error");
  });
});
