import fs from "node:fs";
import path from "node:path";
import {
  directoryExists,
  fileExists,
  findLatestChildDirectory,
  joinPathList,
  rootDir,
  run,
  runPnpm,
  runQuiet,
} from "./script-utils.mjs";

const cargoManifestPath = path.join(rootDir, "src-tauri", "Cargo.toml");
const artifactsDir = path.join(rootDir, "artifacts", "windows");
const targetDir = path.join(rootDir, "src-tauri", "target");
const portableBinaryName = "codex-web";
const exeIconPath = path.join(rootDir, "src-tauri", "icons", "icon.ico");
const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
const programFilesX86 =
  process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
const windowsKitsRoot = path.join(programFilesX86, "Windows Kits", "10");

const builds = [
  {
    target: "x86_64-pc-windows-msvc",
    suffix: "x64",
    arch: "x64",
    toolchain: "stable-x86_64-pc-windows-msvc",
  },
  {
    target: "i686-pc-windows-msvc",
    suffix: "x86",
    arch: "x86",
    toolchain: "stable-i686-pc-windows-msvc",
  },
  {
    target: "aarch64-pc-windows-msvc",
    suffix: "arm64",
    arch: "arm64",
    toolchain: "stable-x86_64-pc-windows-msvc",
  },
];

function ensureToolchainInstalled(toolchain) {
  const installedToolchains = runQuiet("rustup", ["toolchain", "list"]);
  if (!installedToolchains.includes(toolchain)) {
    run("rustup", ["toolchain", "install", toolchain, "--profile", "minimal"]);
  }
}

function ensureRustTargetInstalled(target, toolchain) {
  run("rustup", ["target", "add", target, "--toolchain", toolchain]);
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

  throw new Error("Could not locate Visual Studio. Install Visual Studio Build Tools with C++.");
}

function findWindowsSdkVersion() {
  const libRoot = path.join(windowsKitsRoot, "Lib");
  const latest = findLatestChildDirectory(libRoot);
  if (!latest) {
    throw new Error(`Could not locate Windows SDK libraries under ${libRoot}.`);
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
    PATH: joinPathList([hostBinDir, sdkBinDir, process.env.PATH]),
    CC: "cl.exe",
    CXX: "cl.exe",
    AR: "lib.exe",
    INCLUDE: joinPathList(includePaths),
    LIB: joinPathList(libPaths),
    VCToolsInstallDir: `${msvcRoot}\\`,
    WindowsSdkDir: `${windowsKitsRoot}\\`,
    WindowsSDKVersion: `${sdkVersion}\\`,
    VSCMD_ARG_TGT_ARCH: arch,
  };
}

function findArm64Env() {
  const baseEnv = findMsvcEnv("arm64");
  const llvmBinDir = [
    path.join(programFiles, "LLVM", "bin"),
    path.join(programFilesX86, "LLVM", "bin"),
  ].find(directoryExists);

  if (!llvmBinDir) {
    throw new Error("Could not locate LLVM. Install LLVM for Windows ARM64 linking.");
  }

  return {
    ...baseEnv,
    PATH: joinPathList([llvmBinDir, baseEnv.PATH]),
    CC: "clang-cl",
    CXX: "clang-cl",
    AR: "llvm-lib",
    CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER: "lld-link",
  };
}

function cleanArtifactsDir() {
  fs.rmSync(artifactsDir, { recursive: true, force: true });
  fs.mkdirSync(artifactsDir, { recursive: true });
}

function copyPortableExe(target, suffix) {
  const sourcePath = path.join(targetDir, target, "release", `${portableBinaryName}.exe`);
  if (!fileExists(sourcePath)) {
    throw new Error(`Expected build output was not found: ${sourcePath}`);
  }

  const destinationPath = path.join(artifactsDir, `codex-switcher-${suffix}.exe`);
  fs.copyFileSync(sourcePath, destinationPath);
  return destinationPath;
}

async function stampExeIcon(exePath) {
  if (!fileExists(exeIconPath)) {
    throw new Error(`Could not locate the Windows icon at ${exeIconPath}.`);
  }

  const module = await import("rcedit");
  const rcedit = module.rcedit ?? module.default ?? module;

  if (typeof rcedit !== "function") {
    throw new Error("The rcedit package did not export a callable function.");
  }

  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve();
    };

    try {
      const result = rcedit(exePath, { icon: exeIconPath }, (error) => finish(error));
      if (result && typeof result.then === "function") {
        result.then(() => finish(), (error) => finish(error));
      } else if (rcedit.length < 3) {
        finish();
      }
    } catch (error) {
      finish(error);
    }
  });
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("Portable Windows builds must be produced on Windows with MSVC installed.");
  }

  cleanArtifactsDir();
  runPnpm(["build"]);

  for (const build of builds) {
    ensureToolchainInstalled(build.toolchain);
    ensureRustTargetInstalled(build.target, build.toolchain);

    const env = {
      RUSTUP_TOOLCHAIN: build.toolchain,
      ...(build.arch === "arm64" ? findArm64Env() : findMsvcEnv(build.arch)),
    };

    run(
      "rustup",
      [
        "run",
        build.toolchain,
        "cargo",
        "build",
        "--release",
        "--bin",
        portableBinaryName,
        "--features",
        "bundle-frontend",
        "--target",
        build.target,
        "--manifest-path",
        cargoManifestPath,
      ],
      env
    );

    const exePath = copyPortableExe(build.target, build.suffix);
    await stampExeIcon(exePath);
  }

  console.log(`Portable Windows builds are ready in ${artifactsDir}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
