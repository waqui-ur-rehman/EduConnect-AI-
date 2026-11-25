/* Read-only audit of CSS colors, theme-token usage, and self-referencing variables. */
/* global process */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(projectRoot, "src");
const themePath = path.join(sourceRoot, "styles", "theme.css");
const excludedThemePath = path.join("src", "styles", "theme.css");
const hexPattern = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-f])/gi;
const colorFunctionPattern = /\b(?:rgba?|hsla?)\s*\([^)]*\)/gi;
const tokenUsagePattern = /var\(\s*--edc-[\w-]+/g;
const variableDeclarationPattern = /(--[\w-]+)\s*:\s*([^;{}]+);/g;
const selfReferencePattern = /var\(\s*(--[\w-]+)/g;

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
}

function normalizeHex(hex) {
  const value = hex.toLowerCase();
  if (value.length === 4) {
    return `#${[...value.slice(1)].map((digit) => `${digit}${digit}`).join("")}`;
  }
  return value;
}

async function findCssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return findCssFiles(entryPath);
      }
      return entry.isFile() && entry.name.endsWith(".css") ? [entryPath] : [];
    }),
  );
  return files.flat();
}

function getSection(relativePath) {
  const lowerPath = relativePath.toLowerCase();
  const fileName = path.basename(relativePath);
  if (lowerPath.includes("/admin/")) {
    return "ADMIN";
  }
  if (
    lowerPath.includes("/teacher/") ||
    /teacher|instructor/i.test(fileName)
  ) {
    return "TEACHER";
  }
  if (lowerPath.includes("/student/") || /student/i.test(fileName)) {
    return "STUDENT";
  }
  if (relativePath === "src/pages/dashboards/Dashboard.css") {
    return "SHARED-DASHBOARD";
  }
  return "OTHER";
}

function getLineNumber(text, index) {
  return text.slice(0, index).split("\n").length;
}

function formatTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index]).length)),
  );
  const formatRow = (row) =>
    row.map((cell, index) => String(cell).padEnd(widths[index])).join(" | ");
  return [
    formatRow(headers),
    widths.map((width) => "-".repeat(width)).join("-+-"),
    ...rows.map(formatRow),
  ].join("\n");
}

const themeCss = stripComments(await readFile(themePath, "utf8"));
const tokensByHex = new Map();
for (const match of themeCss.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{3,8})\s*;/gi)) {
  const name = match[1];
  const hex = normalizeHex(match[2]);
  const tokens = tokensByHex.get(hex) ?? [];
  tokens.push(name);
  tokensByHex.set(hex, tokens);
}

const cssPaths = (await findCssFiles(sourceRoot))
  .filter((filePath) => path.relative(projectRoot, filePath) !== excludedThemePath)
  .sort();
const fileReports = [];
const hexTotals = new Map();
const selfReferences = [];

for (const filePath of cssPaths) {
  const relativePath = path.relative(projectRoot, filePath).split(path.sep).join("/");
  const css = stripComments(await readFile(filePath, "utf8"));
  const hexes = [...css.matchAll(hexPattern)].map((match) =>
    normalizeHex(match[0]),
  );
  const colorFunctions = [...css.matchAll(colorFunctionPattern)];
  const tokenUsages = [...css.matchAll(tokenUsagePattern)].length;
  const hardcodedColors = hexes.length + colorFunctions.length;
  const hexCounts = new Map();

  for (const hex of hexes) {
    hexCounts.set(hex, (hexCounts.get(hex) ?? 0) + 1);
    const total = hexTotals.get(hex) ?? { count: 0, files: new Set() };
    total.count += 1;
    total.files.add(relativePath);
    hexTotals.set(hex, total);
  }

  fileReports.push({
    path: relativePath,
    section: getSection(relativePath),
    hardcodedColors,
    tokenUsages,
    hexCounts,
  });

  for (const declaration of css.matchAll(variableDeclarationPattern)) {
    const variableName = declaration[1];
    const value = declaration[2];
    for (const reference of value.matchAll(selfReferencePattern)) {
      if (reference[1] === variableName) {
        selfReferences.push({
          path: relativePath,
          line: getLineNumber(css, declaration.index),
          variable: variableName,
        });
      }
    }
  }
}

const sections = [
  "ADMIN",
  "TEACHER",
  "STUDENT",
  "SHARED-DASHBOARD",
  "OTHER",
];
const summaryRows = sections.map((section) => {
  const files = fileReports.filter((file) => file.section === section);
  const hardcoded = files.reduce((total, file) => total + file.hardcodedColors, 0);
  const tokens = files.reduce((total, file) => total + file.tokenUsages, 0);
  const percentage =
    hardcoded + tokens === 0
      ? "0.0%"
      : `${((tokens / (hardcoded + tokens)) * 100).toFixed(1)}%`;
  return [section, files.length, hardcoded, tokens, percentage];
});

console.log("CSS color audit (token usage % = tokens / (tokens + hardcoded colors))");
console.log(
  formatTable(
    ["Section", "CSS files", "Hardcoded", "Token usages", "Token %"],
    summaryRows,
  ),
);

console.log("\n12 CSS files with the most hardcoded colors");
const topFiles = [...fileReports]
  .sort(
    (left, right) =>
      right.hardcodedColors - left.hardcodedColors ||
      left.path.localeCompare(right.path),
  )
  .slice(0, 12)
  .map((file) => [file.path, file.hardcodedColors, file.tokenUsages]);
console.log(formatTable(["File", "Hardcoded", "Token usages"], topFiles));

console.log("\n40 most common hardcoded HEX values");
const topHexes = [...hexTotals.entries()]
  .sort(
    (left, right) =>
      right[1].count - left[1].count || left[0].localeCompare(right[0]),
  )
  .slice(0, 40)
  .map(([hex, data]) => [
    hex,
    data.count,
    data.files.size,
    [...data.files].sort().join(", "),
    (tokensByHex.get(hex) ?? []).join(", ") || "(no token)",
  ]);
console.log(
  formatTable(
    ["HEX", "Count", "Files", "Files containing color", "Theme token(s)"],
    topHexes,
  ),
);

if (selfReferences.length === 0) {
  console.log("\nSelf-referencing custom properties: none found.");
} else {
  console.log("\nSelf-referencing custom properties:");
  for (const reference of selfReferences) {
    console.log(
      `${reference.path}:${reference.line} ${reference.variable} references itself`,
    );
  }
  process.exitCode = 1;
}
