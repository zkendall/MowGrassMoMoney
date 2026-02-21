#!/usr/bin/env node
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const runRegressionTestsPath = path.join(__dirname, 'run-regression-tests.js');
const passthroughArgs = process.argv.slice(2);
const mergedArgs = passthroughArgs.includes('--suite')
  ? passthroughArgs
  : ['--suite', 'quick', ...passthroughArgs];

const result = spawnSync(
  process.execPath,
  [runRegressionTestsPath, ...mergedArgs],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status || 1);
}
