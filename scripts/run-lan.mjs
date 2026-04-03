import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const rootDir = process.cwd();
const cargoManifestPath = path.join(rootDir, "src-tauri", "Cargo.toml");
const windowsDelimiter = path.delimiter;
const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
const programFilesX86 =
  process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
const windowsKitsRoot = path.join(programFilesX86, "Windows Kits", "10");

function run(command, args, extraEnv = {}) {
  execFileSync(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
}

function runQuiet(command, args, extraEnv = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
}

function joinPathList(parts) {
  return parts.filter(Boolean).join(windowsDelimiter);
}

function directoryExists(dirPath) {
  return Boolean(dirPath) && fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function compareVersionStrings(left, right) {
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

function findLatestChildDirectory(parentDir) {
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

function findVisualStudioRoot() {
  const candidates = [
    path.join(programFiles, "Microsoft Visual Studio", "18", "Community"),
    path.join(programFiles, "Microsoft Visual Studio", "18", "Professional"),
    path.join(programFiles, "Microsoft Visual Studio", "18", "Enterprise"),
    path.join(programFiles, "Microsoft Visual Studio", "18", "BuildTools"),
    path.join(programFiles, "Microsoft Visual Studio", "2022", "Community"),
    path.join(programFiles, "Microsoft Visual Studio", "2022", "Professional"),
    path.join(programFiles, "Microsoft Visual Studio", "2022", "Enterprise"),
    path.join(programFiles, "Microsoft Visual Studio", "2022", "BuildTools"),
  ];

  for (const candidate of candidates) {
    if (directoryExists(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not locate Visual Studio. Install the C++ toolchain.");
}

function findWindowsSdkVersion() {
  const libRoot = path.join(windowsKitsRoot, "Lib");
  const latest = findLatestChildDirectory(libRoot);
  if (!latest) {
    throw new Error(`Could not locate the Windows SDK libraries under ${libRoot}.`);
  }

  return latest;
}

function findArm64MsvcEnv() {
  const visualStudioRoot = findVisualStudioRoot();
  const msvcToolsDir = path.join(visualStudioRoot, "VC", "Tools", "MSVC");
  const msvcVersion = findLatestChildDirectory(msvcToolsDir);
  if (!msvcVersion) {
    throw new Error(`Could not find an MSVC toolset under ${msvcToolsDir}.`);
  }

  const msvcRoot = path.join(msvcToolsDir, msvcVersion);
  const sdkVersion = findWindowsSdkVersion();
  const sdkIncludeRoot = path.join(windowsKitsRoot, "Include", sdkVersion);
  const sdkLibRoot = path.join(windowsKitsRoot, "Lib", sdkVersion);
  const llvmDirCandidates = [
    path.join(programFiles, "LLVM", "bin"),
    path.join(programFilesX86, "LLVM", "bin"),
  ];
  const llvmDir = llvmDirCandidates.find(directoryExists);

  if (!llvmDir) {
    throw new Error("Could not locate LLVM. Install LLVM or add clang-cl and lld-link to PATH.");
  }

  return {
    PATH: joinPathList([llvmDir, process.env.PATH]),
    CC: "clang-cl",
    CXX: "clang-cl",
    AR: "llvm-lib",
    CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER: "lld-link",
    INCLUDE: joinPathList([
      path.join(msvcRoot, "include"),
      path.join(msvcRoot, "atlmfc", "include"),
      path.join(sdkIncludeRoot, "ucrt"),
      path.join(sdkIncludeRoot, "um"),
      path.join(sdkIncludeRoot, "shared"),
      path.join(sdkIncludeRoot, "winrt"),
      path.join(sdkIncludeRoot, "cppwinrt"),
    ].filter(directoryExists)),
    LIB: joinPathList([
      path.join(msvcRoot, "lib", "arm64"),
      path.join(msvcRoot, "atlmfc", "lib", "arm64"),
      path.join(sdkLibRoot, "ucrt", "arm64"),
      path.join(sdkLibRoot, "um", "arm64"),
    ].filter(directoryExists)),
  };
}

function main() {
  const env = findArm64MsvcEnv();
  run("cargo", ["run", "--release", "--manifest-path", cargoManifestPath, "--bin", "codex-web"], env);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
