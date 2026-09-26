// Plain CommonJS so it runs (and explains the problem) on any Node version.
const { engines } = require('../package.json');
const [major, minor] = process.versions.node.split('.').map(Number);
const [reqMajor, reqMinor] = engines.node.replace(/[^\d.]/g, '').split('.').map(Number);

if (major < reqMajor || (major === reqMajor && minor < (reqMinor ?? 0))) {
  console.error(
    `\n✖ Node ${engines.node} is required (you are on ${process.version}).\n` +
      '  NestJS 12 is ESM-only and fails on older Node with ERR_REQUIRE_ESM.\n' +
      '  Fix: nvm install && nvm use   (reads the repo .nvmrc → Node 24)\n',
  );
  process.exit(1);
}
