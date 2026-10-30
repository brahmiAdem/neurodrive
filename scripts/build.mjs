// Copies only the files the site needs into dist/ for deployment.

import { cp, rm, mkdir } from "node:fs/promises";

const FILES = ["index.html", "css", "js"];

await rm("dist", { recursive: true, force: true });
await mkdir("dist");
for (const f of FILES) await cp(f, `dist/${f}`, { recursive: true });
console.log(`Built dist/ (${FILES.join(", ")})`);
