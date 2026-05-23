import { runPnpm } from "./script-utils.mjs";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/pnpm-run.mjs <pnpm args...>");
  process.exit(1);
}

runPnpm(args);
