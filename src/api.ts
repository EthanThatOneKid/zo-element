import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { buildZoLiveEditPrompt } from "./prompt";
import { replacePackRouteCode, type ParsedRoute } from "./zopack";

export interface ZoLiveEditRequestBody {
  pack_markdown: string;
  pack_file_path?: string;
  pack_name: string;
  pack_path?: string;
  target_path: string;
  target_route_type: ParsedRoute["route_type"];
  before_code: string;
  after_code: string;
  conversation_id?: string;
  model_name?: string;
  persona_id?: string;
}

const structuredOutputSchema = {
  type: "object",
  properties: {
    approved: { type: "boolean" },
    summary: { type: "string" },
    updated_pack_markdown: { type: "string" },
  },
  required: ["approved", "summary", "updated_pack_markdown"],
} as const;

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
}

function constantTimeEqualString(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}

/**
 * Returns true when the request is authorized.
 *
 * When `ZO_ELEMENT_API_SECRET` is set on the server, the caller must send
 * `Authorization: Bearer <secret>` with a constant-time-matching token.
 * When it is not set, the route is treated as open (preserves the easy
 * demo path; production deployments should always set the secret).
 */
export function isZoLiveEditAuthorized(c: Context): boolean {
  const secret = process.env.ZO_ELEMENT_API_SECRET;
  if (!secret) return true;
  const header = c.req.header("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;
  return constantTimeEqualString(header.slice(7), secret);
}

async function persistUpdatedPack(packFilePath: string, nextMarkdown: string): Promise<void> {
  try {
    await mkdir(dirname(packFilePath), { recursive: true });
    await Bun.write(packFilePath, nextMarkdown);
  } catch (cause) {
    throw new Error(
      `Failed to persist pack to ${packFilePath}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

export async function handleZoLiveEditRequest(c: Context): Promise<Response> {
  if (!isZoLiveEditAuthorized(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const apiKey = process.env.ZO_API_KEY;
  const body = (await c.req.json().catch(() => null)) as ZoLiveEditRequestBody | null;
  if (
    !body ||
    typeof body.pack_markdown !== "string" ||
    typeof body.pack_name !== "string" ||
    typeof body.target_path !== "string" ||
    typeof body.target_route_type !== "string" ||
    typeof body.before_code !== "string" ||
    typeof body.after_code !== "string"
  ) {
    return c.json({ error: "Missing pack edit payload" }, 400);
  }

  let nextMarkdown: string;
  try {
    nextMarkdown = replacePackRouteCode(
      body.pack_markdown,
      { path: body.target_path, route_type: body.target_route_type },
      body.after_code,
    );
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }

  if (!apiKey) {
    if (typeof body.pack_file_path === "string" && body.pack_file_path.trim().length > 0) {
      try {
        await persistUpdatedPack(body.pack_file_path, nextMarkdown);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    }

    return c.json({
      output: {
        approved: true,
        summary: "Applied without Zo confirmation because ZO_API_KEY is not set.",
        updated_pack_markdown: nextMarkdown,
      },
      conversation_id: body.conversation_id,
      skipped_zo: true,
    });
  }

  const input = buildZoLiveEditPrompt({
    packName: body.pack_name,
    packPath: body.pack_path,
    target: { path: body.target_path, route_type: body.target_route_type },
    beforeCode: body.before_code,
    afterCode: body.after_code,
    updatedPackMarkdown: nextMarkdown,
    conversationId: body.conversation_id,
  });

  const response = await fetch("https://api.zo.computer/zo/ask", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      input,
      conversation_id: body.conversation_id,
      model_name: body.model_name,
      persona_id: body.persona_id,
      output_format: structuredOutputSchema,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return new Response(JSON.stringify({ error: "Zo API request failed", status: response.status, details: payload }), {
      status: response.status,
      headers: { "content-type": "application/json; charset=UTF-8" },
    });
  }

  const output = payload?.output;
  if (!output || typeof output !== "object") {
    return c.json({ error: "Zo response did not include structured output" }, 502);
  }

  if (output.approved !== true) {
    return c.json({ error: "Zo did not approve the edit", summary: output.summary ?? "" }, 409);
  }

  if (normalizeNewlines(output.updated_pack_markdown) !== normalizeNewlines(nextMarkdown)) {
    return c.json({ error: "Zo returned pack markdown that does not match the requested edit" }, 502);
  }

  if (typeof body.pack_file_path === "string" && body.pack_file_path.trim().length > 0) {
    try {
      await persistUpdatedPack(body.pack_file_path, nextMarkdown);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    }
  }

  return c.json({
    output: {
      approved: true,
      summary: output.summary,
      updated_pack_markdown: nextMarkdown,
    },
    conversation_id: payload.conversation_id,
  });
}
