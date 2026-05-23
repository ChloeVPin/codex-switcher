import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const rootDir = process.cwd();
export const pathDelimiter = path.delimiter;

export function run(command, args, extraEnv = {}) {
  execFileSync(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
}

export function runQuiet(command, args, extraEnv = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
}

export function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "which";
  const args = [command];

  try {
    execFileSync(probe, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function runPnpm(args, extraEnv = {}) {
  if (process.env.npm_execpath) {
    const isNpm = process.env.npm_execpath.includes("npm");
    const commandArgs = isNpm && args[0] !== "exec" && args[0] !== "run" ? ["run", ...args] : args;
    run(process.execPath, [process.env.npm_execpath, ...commandArgs], extraEnv);
    return;
  }

  if (commandExists("pnpm")) {
    run("pnpm", args, extraEnv);
    return;
  }

  if (commandExists("corepack")) {
    run("corepack", ["pnpm", ...args], extraEnv);
    return;
  }

  throw new Error("Could not find pnpm or corepack. Install pnpm, or enable Corepack.");
}

export function directoryExists(dirPath) {
  return Boolean(dirPath) && fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

export function fileExists(filePath) {
  return Boolean(filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

export function compareVersionStrings(left, right) {
  const leftParts = left.split(/[.-]/).map((value) => Number.parseInt(value, 10));
  const rightParts = right.split(/[.-]/).map((value) => Number.parseInt(value, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }
  }

  return right.localeCompare(left);
}

export function findLatestChildDirectory(parentDir) {
  if (!directoryExists(parentDir)) {
    return undefined;
  }

  const entries = fs
    .readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (entries.length === 0) {
    return undefined;
  }

  return entries.sort(compareVersionStrings)[0];
}

export function joinPathList(parts) {
  return parts.filter(Boolean).join(pathDelimiter);
}
