#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function walkFiles(rootDir, dir = rootDir, rel = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let out = [];
  for (const entry of entries) {
    const childRel = rel ? path.posix.join(rel, entry.name) : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (childRel === 'output' || childRel === '.git' || childRel === 'node_modules') {
        continue;
      }
      out = out.concat(walkFiles(rootDir, fullPath, childRel));
      continue;
    }
    out.push(childRel);
  }
  return out;
}

function toHashMap(rootDir, files) {
  const hashes = {};
  for (const relPath of files) {
    const fullPath = path.join(rootDir, relPath);
    const data = fs.readFileSync(fullPath);
    hashes[relPath] = crypto.createHash('sha1').update(data).digest('hex');
  }
  return hashes;
}

function getChangedFiles(prevHashes, currentHashes) {
  const allKeys = new Set([...Object.keys(prevHashes), ...Object.keys(currentHashes)]);
  const changed = [];
  for (const key of allKeys) {
    if (prevHashes[key] !== currentHashes[key]) changed.push(key);
  }
  return changed;
}

function buildLabel(changed) {
  const has = (pattern) => changed.some((file) => pattern.test(file));
  const categories = [];
  if (has(/(^|\/)game\.js$/)) categories.push('gameplay');
  if (has(/(^|\/)(index\.html|styles\.css)$/)) categories.push('ui');
  if (has(/(^|\/)(README\.md|POC-Tycoon\.md|progress\.md)$/)) categories.push('docs');
  if (has(/(^|\/)scripts\/(verify-tycoon\.sh|verify-tycoon-quick\.sh|verify-tycoon-quick\.js|verify-tycoon-headed-runner\.js|run-regression-tests\.js|compute-verify-label\.js|summarize-verify-states\.js)$/)) categories.push('verify');

  const leaf = (file) => file.split('/').pop() || file;
  const slug = (value) =>
    value
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

  let label = 'no-change';
  if (changed.length) {
    if (categories.length) {
      label = categories.slice(0, 2).join('-');
    } else {
      label = slug(leaf(changed[0])) || 'misc';
    }
  }
  return label.slice(0, 32).replace(/-+$/g, '');
}

function computeVerifyLabel(rootDir, stateOutPath, historyPath) {
  const files = walkFiles(rootDir).sort();
  const hashes = toHashMap(rootDir, files);
  const prev = fs.existsSync(historyPath)
    ? JSON.parse(fs.readFileSync(historyPath, 'utf8'))
    : { hashes: {} };
  const changed = getChangedFiles(prev.hashes || {}, hashes);
  const label = buildLabel(changed);

  fs.writeFileSync(
    stateOutPath,
    JSON.stringify(
      {
        hashes,
        changed,
        label,
        computed_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  return label;
}

function main() {
  const rootDir = process.argv[2];
  const stateOutPath = process.argv[3];
  const historyPath = process.argv[4];
  if (!rootDir || !stateOutPath || !historyPath) {
    console.error('Usage: node compute-verify-label.js <rootDir> <stateOutPath> <historyPath>');
    process.exit(1);
  }
  const label = computeVerifyLabel(rootDir, stateOutPath, historyPath);
  console.log(label);
}

if (require.main === module) {
  main();
}

module.exports = {
  computeVerifyLabel,
};
