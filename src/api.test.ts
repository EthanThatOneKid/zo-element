import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { handleZoLiveEditRequest, isZoLiveEditAuthorized } from "./api";

const ORIGINAL_ENV = { ...process.env };

function mountApp() {
  const app = new Hono();
  app.post("/api/zopack-live-edit", (c) => handleZoLiveEditRequest(c));
  return app;
}

const PACK = `---
format: zopack
name: sample
---
# sample
### \`/\` (page, public)
\`\`\`tsx
export default function Home() {
  return <main>hello</main>;
}
\`\`\`
`;

const EDIT_BODY = {
  pack_markdown: PACK,
  pack_file_path: "/tmp/zo-element-api-test/nonexistent/pack.zopack.md",
  pack_name: "sample",
  pack_path: "Inbox/sample.zopack.md",
  target_path: "/",
  target_route_type: "page",
  before_code: `export default function Home() {\n  return <main>hello</main>;\n}`,
  after_code: `export default function Home() {\n  return <main>updated</main>;\n}`,
};

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.ZO_ELEMENT_API_SECRET;
  delete process.env.ZO_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("isZoLiveEditAuthorized", () => {
  test("returns true when no secret is configured (demo path)", async () => {
    delete process.env.ZO_ELEMENT_API_SECRET;
    const app = mountApp();
    const response = await app.request("/api/zopack-live-edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(EDIT_BODY),
    });
    expect(response.status).not.toBe(401);
  });

  test("returns 401 when a secret is configured but no Authorization header is sent", async () => {
    process.env.ZO_ELEMENT_API_SECRET = "s3cret-token";
    const app = mountApp();
    const response = await app.request("/api/zopack-live-edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(EDIT_BODY),
    });
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe("Unauthorized");
  });

  test("returns 401 when the bearer token does not match", async () => {
    process.env.ZO_ELEMENT_API_SECRET = "s3cret-token";
    const app = mountApp();
    const response = await app.request("/api/zopack-live-edit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong-token",
      },
      body: JSON.stringify(EDIT_BODY),
    });
    expect(response.status).toBe(401);
  });

  test("accepts a request with the matching bearer token", async () => {
    process.env.ZO_ELEMENT_API_SECRET = "s3cret-token";
    delete process.env.ZO_API_KEY;
    const app = mountApp();
    const response = await app.request("/api/zopack-live-edit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer s3cret-token",
      },
      body: JSON.stringify(EDIT_BODY),
    });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.output.approved).toBe(true);
    expect(payload.skipped_zo).toBe(true);
  });
});

describe("handleZoLiveEditRequest — disk persistence", () => {
  test("returns 500 (not an uncaught rejection) when the pack file path is unwritable", async () => {
    delete process.env.ZO_API_KEY;
    // /proc is read-only inside the sandbox, so any write attempt fails.
    const body = {
      ...EDIT_BODY,
      pack_file_path: "/proc/zo-element-api-test/should-not-exist/pack.zopack.md",
    };
    const app = mountApp();
    const response = await app.request("/api/zopack-live-edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(typeof payload.error).toBe("string");
    expect(payload.error).toContain("Failed to persist pack");
  });

  test("returns 200 and writes the updated pack when persistence succeeds", async () => {
    delete process.env.ZO_API_KEY;
    const target = `/tmp/zo-element-api-test-ok/${crypto.randomUUID()}/pack.zopack.md`;
    const body = { ...EDIT_BODY, pack_file_path: target };
    const app = mountApp();
    const response = await app.request("/api/zopack-live-edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);

    const written = await Bun.file(target).text();
    expect(written).toContain("updated");
  });
});
