import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
/** Fingerprints application sources; private state and generated Next files are excluded. */
export function applicationHash(root) {
  const files = [];
  const walk = (relative) => {
    const absolute = path.join(root, relative);
    if (!existsSync(absolute)) return;
    for (const item of readdirSync(absolute, { withFileTypes: true })) {
      if (item.isSymbolicLink()) continue;
      const name = path.join(relative, item.name);
      if (item.isDirectory()) walk(name);
      else files.push(name);
    }
  };
  for (const directory of ["app", "components", "lib", "public"])
    walk(directory);
  for (const name of [
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "next.config.mjs",
    "tsconfig.json",
    "postcss.config.mjs",
    "prisma/schema.prisma",
  ])
    if (existsSync(path.join(root, name))) files.push(name);
  const hash = createHash("sha256");
  for (const name of files.sort()) {
    hash.update(name.replaceAll(path.sep, "/"));
    hash.update("\0");
    hash.update(readFileSync(path.join(root, name)));
    hash.update("\0");
  }
  return hash.digest("hex");
}
