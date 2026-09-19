import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Keep the standalone and hosted lab on one UI source. Vercel owns the Python
// endpoint; Next serves these generated public files without a second UI bundle.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = path.join(root, "demos/algorithm-lab/static");
const output = path.join(root, "public/algorithm-lab");
await mkdir(path.join(output, "static"), { recursive: true });
for (const name of ["app.js", "style.css", "icon.svg", "fonts"]) {
  await cp(path.join(source, name), path.join(output, "static", name), { recursive: true });
}
const html = (await readFile(path.join(source, "index.html"), "utf8"))
  .replace('<body>', '<body data-api-endpoint="/api/algorithm-lab">')
  .replaceAll('"/static/', '"/algorithm-lab/static/')
  .replace('href="https://railplan-nine.vercel.app/ps1"', 'href="/ps1"');
await writeFile(path.join(output, "index.html"), html);
console.log("Exported /algorithm-lab from the shared teaching UI.");
