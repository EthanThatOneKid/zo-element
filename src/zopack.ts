export interface ParsedRoute {
  path: string;
  route_type: "api" | "page";
  public: boolean;
  code: string;
}

export interface ParsedPack {
  meta: Record<string, string>;
  routes: ParsedRoute[];
}

export interface PackRouteTarget {
  path: string;
  route_type: ParsedRoute["route_type"];
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Walks `body` and yields the character index of every `### ` line that is NOT
 * inside a fenced code block. Route headers at any other position (inside
 * code, inside inline backticks that don't open a fence) are ignored.
 */
function findRouteHeaderIndices(body: string): number[] {
  const indices: number[] = [];
  let cursor = 0;
  let inFence = false;
  let fenceMarker = "";

  while (cursor < body.length) {
    if (!inFence) {
      // Look for the next triple-backtick fence opener.
      const openerMatch = /```[^\n]*\n?/.exec(body.slice(cursor));
      const headerMatch = /^###\s+/m.exec(body.slice(cursor));
      const openerIdx = openerMatch ? openerMatch.index : -1;
      const headerIdx = headerMatch ? headerMatch.index : -1;

      if (headerIdx === -1) return indices;
      if (openerIdx !== -1 && openerIdx < headerIdx) {
        // Header is after a fence opener — the header is inside the fence.
        cursor += openerIdx + openerMatch![0].length;
        inFence = true;
        fenceMarker = "```";
        continue;
      }
      // Header is before any fence opener — record it.
      indices.push(cursor + headerIdx);
      cursor += headerIdx + headerMatch![0].length;
    } else {
      // We're inside a fence; look for the matching closing fence.
      const closer = body.indexOf("\n```", cursor);
      if (closer === -1) {
        // Unterminated fence — the rest of the file is the fence body.
        return indices;
      }
      cursor = closer + 4; // skip past "\n```"
      inFence = false;
      fenceMarker = "";
    }
  }

  return indices;
}

function buildRouteHeaderRegex(target: PackRouteTarget): RegExp {
  // Matches the exact line that opens a route section. We escape the path so
  // user-controlled route paths (e.g. "/api/v1/:id") are matched literally.
  // The opening backticks and parens are escaped as plain regex characters.
  const pathPart = "`" + escapeRegExp(target.path) + "`";
  return new RegExp(
    `^###\\s+${pathPart}\\s+\\((${target.route_type}),\\s*(public|private)\\)\\s*$`,
    "m",
  );
}

function findRouteHeaderAt(body: string, target: PackRouteTarget): number | null {
  const indices = findRouteHeaderIndices(body);
  const headerRegex = buildRouteHeaderRegex(target);
  for (const startIndex of indices) {
    const tail = body.slice(startIndex);
    const match = headerRegex.exec(tail);
    if (match && match.index === 0) return startIndex;
  }
  return null;
}

function findNextRouteHeaderAfter(body: string, afterIndex: number): number | null {
  const indices = findRouteHeaderIndices(body);
  for (const startIndex of indices) {
    if (startIndex >= afterIndex) return startIndex;
  }
  return null;
}

export function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const normalized = normalizeLineEndings(content);
  const meta: Record<string, string> = {};
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") return { meta, body: normalized };

  const endLineIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endLineIndex === -1) return { meta, body: normalized };

  const frontmatter = lines.slice(1, endLineIndex).join("\n").trim();
  for (const line of frontmatter.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }

  return { meta, body: lines.slice(endLineIndex + 1).join("\n").trim() };
}

export function parsePackFromContent(rawMarkdown: string): ParsedPack {
  const { meta, body } = parseFrontmatter(rawMarkdown);
  if (meta.format !== "zopack") {
    throw new Error("This file does not appear to be a .zopack.md (missing format: zopack in frontmatter)");
  }

  const routes: ParsedRoute[] = [];
  const headerIndices = findRouteHeaderIndices(body);
  const routeHeaderRegex = /^###\s+`([^`]+)`\s+\((\w+),\s*(\w+)\)/m;

  for (let index = 0; index < headerIndices.length; index += 1) {
    const sectionStart = headerIndices[index];
    const sectionEnd = index < headerIndices.length - 1 ? headerIndices[index + 1] : body.length;
    const headerMatch = routeHeaderRegex.exec(body.slice(sectionStart));
    if (!headerMatch) continue;
    const headerEnd = sectionStart + headerMatch[0].length;
    if (headerEnd > sectionEnd) continue;
    const path = headerMatch[1];
    const routeType = headerMatch[2];
    const visibility = headerMatch[3];
    if (routeType !== "api" && routeType !== "page") continue;

    const section = body.slice(headerEnd, sectionEnd);
    const codeMatch = section.match(/```(?:typescript|tsx|ts)\n([\s\S]*?)\n```/);
    if (!codeMatch) continue;

    routes.push({
      path,
      route_type: routeType,
      public: visibility === "public",
      code: codeMatch[1].trimEnd(),
    });
  }

  return { meta, routes };
}

export function replacePackRouteCode(rawMarkdown: string, target: PackRouteTarget, nextCode: string): string {
  const normalized = normalizeLineEndings(rawMarkdown);
  const sectionStart = findRouteHeaderAt(normalized, target);
  if (sectionStart === null) {
    throw new Error(`Could not find route section for ${target.path} (${target.route_type})`);
  }

  const headerRegex = buildRouteHeaderRegex(target);
  const section = normalized.slice(sectionStart);
  const headerMatch = headerRegex.exec(section);
  if (!headerMatch || headerMatch.index !== 0) {
    throw new Error(`Could not find route section for ${target.path} (${target.route_type})`);
  }
  const headerEnd = sectionStart + headerMatch[0].length;

  const nextHeaderIndex = findNextRouteHeaderAfter(normalized, headerEnd);
  const sectionEnd = nextHeaderIndex ?? normalized.length;
  const sectionBody = normalized.slice(headerEnd, sectionEnd);
  const codeBlockMatch = sectionBody.match(/```(?:typescript|tsx|ts)\n([\s\S]*?)\n```/);

  if (!codeBlockMatch) {
    throw new Error(`Could not find code block for ${target.path} (${target.route_type})`);
  }

  const updatedCodeBlock = codeBlockMatch[0].replace(codeBlockMatch[1], nextCode.trimEnd());
  const updatedSectionBody =
    sectionBody.slice(0, codeBlockMatch.index) +
    updatedCodeBlock +
    sectionBody.slice((codeBlockMatch.index ?? 0) + codeBlockMatch[0].length);
  return normalized.slice(0, headerEnd) + updatedSectionBody + normalized.slice(sectionEnd);
}
