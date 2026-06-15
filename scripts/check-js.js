const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  path.join(root, "config.js"),
  ...fs.readdirSync(path.join(root, "js"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(root, "js", name)),
  path.join(root, "server", "static-server.js")
];

let failed = false;
files.forEach((file) => {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) failed = true;
});

if (failed) process.exit(1);
console.log(`Checked ${files.length} JavaScript files.`);
