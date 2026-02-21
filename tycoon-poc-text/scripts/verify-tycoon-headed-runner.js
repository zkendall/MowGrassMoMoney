#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

// NOTE: Keep this runner clean and readable.
// Update steps as documented, explicit actions (avoid opaque compressed logic).

const url = process.argv[2];
const outDir = process.argv[3];
const headless = process.argv[4] !== 'false';

if (!url || !outDir) {
  console.error('Usage: node verify-tycoon-headed-runner.js <url> <outDir> [headless=true|false]');
  process.exit(1);
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  const actionDelayMs = headless ? 0 : 250;
  const pollDelayMs = headless ? 10 : 60;

  const browser = await chromium.launch({
    headless,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({ type: 'console.error', text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    errors.push({ type: 'pageerror', text: String(err) });
  });

  async function readState() {
    const text = await page.evaluate(() =>
      typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : null,
    );
    if (!text) throw new Error('render_game_to_text unavailable');
    return JSON.parse(text);
  }

  async function waitForRenderApi(timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ready = await page.evaluate(
        () => typeof window.render_game_to_text === 'function',
      );
      if (ready) return;
      await page.waitForTimeout(pollDelayMs);
    }
    throw new Error('render_game_to_text unavailable');
  }

  async function waitForMode(mode, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const state = await readState();
      if (state.mode === mode) return state;
      await page.waitForTimeout(pollDelayMs);
    }
    throw new Error(`Timed out waiting for mode=${mode}`);
  }

  async function waitForModeNot(mode, timeoutMs = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const state = await readState();
      if (state.mode !== mode) return state;
      await page.waitForTimeout(pollDelayMs);
    }
    throw new Error(`Timed out waiting for mode!=${mode}`);
  }

  async function press(key, waitMs = actionDelayMs) {
    await page.keyboard.press(key);
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }
  }

  async function moveDayActionCursorTo(target) {
    let state = await waitForMode('day_action');
    while (state.day_action.cursor < target) {
      await press('ArrowDown');
      state = await readState();
    }
    while (state.day_action.cursor > target) {
      await press('ArrowUp');
      state = await readState();
    }
  }

  async function finishProcessing(delayMs = 1200) {
    await waitForMode('processing');
    if (!headless && delayMs > 0) {
      await page.waitForTimeout(delayMs);
    }
    await press('Enter', 200);
    await waitForModeNot('processing');
  }

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForRenderApi();
  if (!headless) {
    await page.waitForTimeout(500);
  }

  // 1) Solicit
  await moveDayActionCursorTo(0);
  await press('Enter');
  await finishProcessing(1300);
  await waitForMode('report');
  await press('Enter', 250); // next day
  await waitForMode('day_action');

  // 2) Follow Up Leads
  await moveDayActionCursorTo(1);
  await press('Enter');
  await finishProcessing(1100);
  await waitForMode('report');
  await press('Enter', 250); // next day
  await waitForMode('day_action');

  // 3) Mow Lawns (select multiple jobs)
  await moveDayActionCursorTo(2);
  await press('Enter');
  const planning = await waitForMode('planning');
  const maxSelections = Math.min(3, (planning.planning_jobs || []).length);
  for (let i = 0; i < maxSelections; i += 1) {
    await press('Space', 200);
    if (i < maxSelections - 1) await press('ArrowDown', 180);
  }
  await press('Enter', 250);
  await waitForMode('performance');
  for (let i = 0; i < 12; i += 1) await press('ArrowUp', 30);
  await press('Enter', 250);
  await finishProcessing(1200);
  const mowReport = await waitForMode('report');
  if ((mowReport.pending_regular_offers || []).length) {
    await press('Space', 200);
  }
  await press('Enter', 250); // next day
  await waitForMode('day_action');

  // 4) Shop for New Hardware (buy path)
  await moveDayActionCursorTo(3);
  await press('Enter');
  await finishProcessing(1000); // transition into hardware_shop
  await waitForMode('hardware_shop');
  await press('Enter', 250); // buy selected option
  await finishProcessing(900);
  await waitForMode('report');

  await page.screenshot({ path: path.join(outDir, 'shot-0.png'), fullPage: true });
  const finalText = await page.evaluate(() =>
    typeof window.render_game_to_text === 'function' ? window.render_game_to_text() : null,
  );
  if (finalText) {
    fs.writeFileSync(path.join(outDir, 'state-0.json'), finalText);
  }
  if (errors.length) {
    fs.writeFileSync(path.join(outDir, 'errors-0.json'), JSON.stringify(errors, null, 2));
  }

  await browser.close();
}

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
