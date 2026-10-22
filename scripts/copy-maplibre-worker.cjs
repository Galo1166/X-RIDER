const fs = require("node:fs");
const path = require("node:path");

const workerSource = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");
const publicDirectory = path.resolve(__dirname, "../public");
fs.mkdirSync(publicDirectory, { recursive: true });
fs.copyFileSync(workerSource, path.join(publicDirectory, "maplibre-gl-worker.mjs"));
