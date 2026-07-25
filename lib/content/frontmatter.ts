/**
 * Dependency-free frontmatter parser for the marketing content layer.
 *
 * Supports the YAML subset the marketing site needs:
 *   key: value
 *   key: "quoted value"
 *   key: true | false | 42
 *   key: [one, two, three]
 *   key:
 *     - one
 *     - two
 */

export type FrontmatterValue = string | number | boolean | string[];
export type Frontmatter = Record<string, FrontmatterValue>;

const DELIMITER = "---";

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function coerce(raw: string): FrontmatterValue {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value !== "" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((item) => unquote(item));
  }
  return unquote(value);
}

/** Splits a raw file into its frontmatter map and markdown body. */
export function parseFrontmatter(source: string): { data: Frontmatter; body: string } {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(`${DELIMITER}\n`)) {
    return { data: {}, body: normalized.trim() };
  }

  const end = normalized.indexOf(`\n${DELIMITER}`, DELIMITER.length);
  if (end === -1) {
    return { data: {}, body: normalized.trim() };
  }

  const rawBlock = normalized.slice(DELIMITER.length + 1, end);
  const body = normalized.slice(end + DELIMITER.length + 1).replace(/^\n+/, "");
  const data: Frontmatter = {};

  let pendingListKey: string | null = null;
  let pendingList: string[] = [];

  const flushList = () => {
    if (pendingListKey) {
      data[pendingListKey] = pendingList;
      pendingListKey = null;
      pendingList = [];
    }
  };

  for (const line of rawBlock.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && pendingListKey) {
      pendingList.push(unquote(listItem[1]));
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;

    flushList();
    const [, key, rawValue] = pair;
    if (rawValue.trim() === "") {
      pendingListKey = key;
      pendingList = [];
      continue;
    }
    data[key] = coerce(rawValue);
  }

  flushList();
  return { data, body: body.trim() };
}

export function readString(data: Frontmatter, key: string, fallback = ""): string {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}

export function readList(data: Frontmatter, key: string): string[] {
  const value = data[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim() !== "") return [value];
  return [];
}

export function readBoolean(data: Frontmatter, key: string, fallback = false): boolean {
  const value = data[key];
  return typeof value === "boolean" ? value : fallback;
}

export function readNumber(data: Frontmatter, key: string, fallback = 0): number {
  const value = data[key];
  return typeof value === "number" ? value : fallback;
}
