import { dirname, join, resolve, sep } from "node:path";

const root = resolve(import.meta.dir, "..");
// Generic arrow functions are only valid TypeScript outside TSX, so each file
// is scanned with the loader for its own extension.
const transpilers = {
  ts: new Bun.Transpiler({ loader: "ts" }),
  tsx: new Bun.Transpiler({ loader: "tsx" }),
};
const portableRoots = [
  "shared",
  "packages/client/src",
  "packages/contracts/src",
];
const browserGlobals =
  /\b(window|document|navigator|localStorage|sessionStorage|indexedDB|HTMLElement|HTMLCanvasElement|PublicKeyCredential)\b/;
// The web app is Solid; React, its UI kits and its query layer must not return.
const obsoleteFrameworks =
  /^(react|react-dom|react\/.*|react-dom\/.*|@heroui\/.*|@tanstack\/react-.*|lucide-react|sonner|@stylexjs\/.*)$/;
const errors: string[] = [];
const isWithin = (path: string, directory: string) =>
  path.startsWith(resolve(root, directory) + sep);

for (const directory of [...portableRoots, "src"]) {
  for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan(
    join(root, directory),
  )) {
    if (file.endsWith(".test.ts")) continue;
    const relative = join(directory, file);
    const source = await Bun.file(join(root, relative)).text();
    const { imports } = transpilers[file.endsWith(".tsx") ? "tsx" : "ts"].scan(source);
    for (const dependency of imports) {
      if (obsoleteFrameworks.test(dependency.path))
        errors.push(
          `${relative}: obsolete framework import ${dependency.path}`,
        );
      if (dependency.path.startsWith(".")) {
        const target = resolve(root, dirname(relative), dependency.path);
        const allowedRoots =
          directory === "src" ? ["src", ...portableRoots] : portableRoots;
        if (!allowedRoots.some((allowed) => isWithin(target, allowed)))
          errors.push(
            `${relative}: import crosses platform boundary: ${dependency.path}`,
          );
      } else if (directory !== "src") {
        const allowed =
          dependency.path === "effect" ||
          dependency.path === "@tanstack/react-query" ||
          dependency.path.startsWith("@wikigems/domain/");
        if (!allowed)
          errors.push(`${relative}: platform dependency ${dependency.path}`);
      }
    }
    if (directory !== "src" && browserGlobals.test(source))
      errors.push(`${relative}: browser global in a portable package`);
  }
}
const manifest = await Bun.file(join(root, "package.json")).json();
for (const name of Object.keys({
  ...manifest.dependencies,
  ...manifest.devDependencies,
})) {
  if (obsoleteFrameworks.test(name))
    errors.push(`package.json: obsolete framework dependency ${name}`);
}
if (errors.length) throw new Error(errors.join("\n"));
console.log(
  "Architecture checks passed: portable packages, web boundary, Solid-only frontend.",
);
