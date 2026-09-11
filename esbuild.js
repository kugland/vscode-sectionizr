const esbuild = require("esbuild");

// Shared with nix/packages.nix, which renders the same options as CLI flags.
const config = require("./esbuild.json");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    ...config.base,
    ...(production ? config.production : config.development),
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
