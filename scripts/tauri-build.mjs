import { execFileSync } from "node:child_process";
import { buildTauriArm64Env, hasArm64WindowsRustHost } from "./windows-rust-env.mjs";

const env = hasArm64WindowsRustHost() ? buildTauriArm64Env() : process.env;
const pnpmExecutable = process.env.npm_execpath ?? "pnpm";
const buildArgs = ["exec", "tauri", "build"];

if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  buildArgs.push("--no-sign");
}

execFileSync(process.execPath, [pnpmExecutable, ...buildArgs], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});
