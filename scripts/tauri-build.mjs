import { runPnpm } from "./script-utils.mjs";
import { buildTauriArm64Env, hasArm64WindowsRustHost } from "./windows-rust-env.mjs";

const env = hasArm64WindowsRustHost() ? buildTauriArm64Env() : process.env;
const buildArgs = ["exec", "tauri", "build", "--features", "bundle-frontend"];

if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  buildArgs.push("--no-sign");
}

runPnpm(buildArgs, env);
