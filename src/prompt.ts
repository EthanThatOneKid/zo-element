import type { PackRouteTarget } from "./zopack";

export function buildZoLiveEditPrompt(args: {
  packName: string;
  packPath?: string;
  target: PackRouteTarget;
  beforeCode: string;
  afterCode: string;
  updatedPackMarkdown: string;
  conversationId?: string;
}): string {
  return [
    "You are helping edit a Zo Computer pack file.",
    `Pack name: ${args.packName}`,
    `Pack file: ${args.packPath || "unknown"}`,
    `Target route: ${args.target.path} (${args.target.route_type})`,
    args.conversationId ? `Conversation: ${args.conversationId}` : null,
    "Verify the pack edit and return JSON that confirms the exact updated file content.",
    "Keep unrelated routes, setup, dependencies, metadata, and formatting unchanged.",
    "",
    "Old code:",
    "```",
    args.beforeCode.trimEnd(),
    "```",
    "",
    "New code:",
    "```",
    args.afterCode.trimEnd(),
    "```",
    "",
    "Expected updated pack markdown:",
    "```markdown",
    args.updatedPackMarkdown.trimEnd(),
    "```",
    "",
    "Return structured JSON with approved=true, a short summary, and updated_pack_markdown that matches the expected markdown exactly.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
