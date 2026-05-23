import path from "node:path";
import { rootDir, run } from "./script-utils.mjs";
import { buildTauriArm64Env, hasArm64WindowsRustHost } from "./windows-rust-env.mjs";

const cargoManifestPath = path.join(rootDir, "src-tauri", "Cargo.toml");

function main() {
  const extraEnv = hasArm64WindowsRustHost() ? buildTauriArm64Env() : {};

  run(
    "cargo",
    [
      "run",
      "--release",
      "--manifest-path",
      cargoManifestPath,
      "--bin",
      "codex-web",
      "--features",
      "bundle-frontend",
    ],
    extraEnv
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
