import type { Context } from "hono";

export interface ZoLiveEditRequestBody {
  input: string;
  conversation_id?: string;
  model_name?: string;
  persona_id?: string;
}

export async function handleZoLiveEditRequest(c: Context): Promise<Response> {
  const apiKey = process.env.ZO_API_KEY;
  if (!apiKey) {
    return c.json({ error: "Missing ZO_API_KEY in Settings > Advanced" }, 500);
  }

  const body = (await c.req.json().catch(() => null)) as ZoLiveEditRequestBody | null;
  if (!body || typeof body.input !== "string" || body.input.trim().length === 0) {
    return c.json({ error: "Missing input" }, 400);
  }

  const response = await fetch("https://api.zo.computer/zo/ask", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      input: body.input,
      conversation_id: body.conversation_id,
      model_name: body.model_name,
      persona_id: body.persona_id,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return new Response(JSON.stringify({ error: "Zo API request failed", status: response.status, details: payload }), {
      status: response.status,
      headers: { "content-type": "application/json; charset=UTF-8" },
    });
  }

  return c.json(payload);
}
