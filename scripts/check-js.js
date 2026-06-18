const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function listJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

const files = [
  path.join(root, "config.js"),
  ...listJavaScriptFiles(path.join(root, "js")),
  path.join(root, "server", "static-server.js")
];

let failed = false;
files.forEach((file) => {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
});

if (failed) process.exit(1);
console.log(`Checked ${files.length} JavaScript files.`);
