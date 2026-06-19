async function run() {
  const { TmuxManager } = await import('./dist/cli.js');
  // wait, the bundled cli doesn't export TmuxManager.
  // I will just use src.
}
run();
