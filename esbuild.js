const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: !production,
  minify: production,
  logLevel: 'info'
};

async function build() {
  if (watch) {
    const context = await esbuild.context(config);
    await context.watch();
    console.log('Watching extension source...');
    return;
  }

  await esbuild.build(config);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
