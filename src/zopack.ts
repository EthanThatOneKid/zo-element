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
  const headers: Array<{ path: string; type: string; visibility: string; index: number }> = [];
  const routeHeaderRegex = /^###\s+`([^`]+)`\s+\((\w+),\s*(\w+)\)/gm;
  let match: RegExpExecArray | null;

  while ((match = routeHeaderRegex.exec(body)) !== null) {
    headers.push({ path: match[1], type: match[2], visibility: match[3], index: match.index });
  }

  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (header.type !== "api" && header.type !== "page") continue;

    const sectionStart = header.index;
    const sectionEnd = index < headers.length - 1 ? headers[index + 1].index : body.length;
    const section = body.slice(sectionStart, sectionEnd);
    const codeMatch = section.match(/```(?:typescript|tsx|ts)\n([\s\S]*?)\n```/);
    if (!codeMatch) continue;

    routes.push({
      path: header.path,
      route_type: header.type,
      public: header.visibility === "public",
      code: codeMatch[1].trimEnd(),
    });
  }

  return { meta, routes };
}

export function replacePackRouteCode(rawMarkdown: string, target: PackRouteTarget, nextCode: string): string {
  const normalized = normalizeLineEndings(rawMarkdown);
  const headerRegex = new RegExp(
    String.raw`^###\s+\`${escapeRegExp(target.path)}\`\s+\(${target.route_type},\s*(public|private)\)\s*$`,
    "m",
  );

  const headerMatch = headerRegex.exec(normalized);
  if (!headerMatch) {
    throw new Error(`Could not find route section for ${target.path} (${target.route_type})`);
  }

  const sectionStart = headerMatch.index;
  const restStart = sectionStart + headerMatch[0].length;
  const nextHeaderMatch = /^\s*###\s+/m.exec(normalized.slice(restStart));
  const sectionEnd = nextHeaderMatch ? restStart + nextHeaderMatch.index : normalized.length;
  const section = normalized.slice(sectionStart, sectionEnd);
  const codeBlockMatch = section.match(/```(?:typescript|tsx|ts)\n([\s\S]*?)\n```/);

  if (!codeBlockMatch) {
    throw new Error(`Could not find code block for ${target.path} (${target.route_type})`);
  }

  const updatedCodeBlock = codeBlockMatch[0].replace(codeBlockMatch[1], nextCode.trimEnd());
  const updatedSection =
    section.slice(0, codeBlockMatch.index) +
    updatedCodeBlock +
    section.slice((codeBlockMatch.index ?? 0) + codeBlockMatch[0].length);
  return normalized.slice(0, sectionStart) + updatedSection + normalized.slice(sectionEnd);
}
