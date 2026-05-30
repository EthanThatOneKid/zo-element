import type { PackRouteTarget } from "./zopack";

export function buildZoLiveEditPrompt(args: {
  packName: string;
  packPath?: string;
  target: PackRouteTarget;
  beforeCode: string;
  afterCode: string;
  conversationId?: string;
}): string {
  return [
    "You are helping edit a Zo Computer pack file.",
    `Pack name: ${args.packName}`,
    `Pack file: ${args.packPath || "unknown"}`,
    `Target route: ${args.target.path} (${args.target.route_type})`,
    args.conversationId ? `Conversation: ${args.conversationId}` : null,
    "Replace the target route's code block in the .zopack.md file with the new code below.",
    "Keep unrelated routes, setup, dependencies, and metadata unchanged.",
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
    "After editing the file, reply with a short confirmation that names the route you changed.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
