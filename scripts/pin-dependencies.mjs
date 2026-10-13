import { readFileSync, writeFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
for (const kind of ["dependencies", "devDependencies"])
  for (const name of Object.keys(pkg[kind] || {})) {
    const version = lock.packages[`node_modules/${name}`].version;
    pkg[kind][name] = version;
    lock.packages[""][kind][name] = version;
  }
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
