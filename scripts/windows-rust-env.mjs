import fs from "node:fs";
import path from "node:path";

const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
const programFilesX86 =
  process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
const windowsDelimiter = path.delimiter;
const windowsKitsRoot = path.join(programFilesX86, "Windows Kits", "10");
const llvmBinDir = path.join(programFiles, "LLVM", "bin");

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

function findMsvcEnv(arch) {
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
  const hostBinDir = path.join(msvcRoot, "bin", "Hostx64", arch);
  const sdkBinDir = path.join(windowsKitsRoot, "bin", sdkVersion, arch);

  if (!directoryExists(hostBinDir)) {
    throw new Error(`Could not locate MSVC host binaries at ${hostBinDir}.`);
  }

  const includePaths = [
    path.join(msvcRoot, "include"),
    path.join(msvcRoot, "atlmfc", "include"),
    path.join(sdkIncludeRoot, "ucrt"),
    path.join(sdkIncludeRoot, "um"),
    path.join(sdkIncludeRoot, "shared"),
    path.join(sdkIncludeRoot, "winrt"),
    path.join(sdkIncludeRoot, "cppwinrt"),
  ].filter(directoryExists);

  const libPaths = [
    path.join(msvcRoot, "lib", arch),
    path.join(msvcRoot, "atlmfc", "lib", arch),
    path.join(sdkLibRoot, "ucrt", arch),
    path.join(sdkLibRoot, "um", arch),
  ].filter(directoryExists);

  return {
    PATH: [hostBinDir, sdkBinDir, process.env.PATH].filter(Boolean).join(windowsDelimiter),
    CC: "cl.exe",
    CXX: "cl.exe",
    AR: "lib.exe",
    INCLUDE: includePaths.join(windowsDelimiter),
    LIB: libPaths.join(windowsDelimiter),
    VCToolsInstallDir: `${msvcRoot}\\`,
    WindowsSdkDir: `${windowsKitsRoot}\\`,
    WindowsSDKVersion: `${sdkVersion}\\`,
    VSCMD_ARG_TGT_ARCH: arch,
  };
}

export function buildTauriArm64Env() {
  const baseEnv = findMsvcEnv("arm64");
  if (!directoryExists(llvmBinDir)) {
    throw new Error(`Could not locate LLVM at ${llvmBinDir}.`);
  }

  return {
    ...baseEnv,
    PATH: [llvmBinDir, baseEnv.PATH].filter(Boolean).join(windowsDelimiter),
    CC: "clang-cl",
    CXX: "clang-cl",
    AR: "llvm-lib",
    CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER: "lld-link",
  };
}

export function hasArm64WindowsRustHost() {
  return process.platform === "win32" && process.arch === "arm64";
}
