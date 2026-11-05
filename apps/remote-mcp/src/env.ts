import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Walk up from this file to find the workspace-root .env, so the server
// starts correctly regardless of the current working directory.
let dir = dirname(fileURLToPath(import.meta.url));
let envPath: string | undefined;

while (true) {
  const candidate = join(dir, ".env");
  if (existsSync(candidate)) {
    envPath = candidate;
    break;
  }

  const parent = dirname(dir);
  if (parent === dir) break;
  dir = parent;
}

if (envPath) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line.trim());
    if (!match) continue;

    const [, key, rawValue] = match;
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    // don't override variables already set in the real environment
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
