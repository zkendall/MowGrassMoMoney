const { test, expect } = require('playwright/test');
const { createGameDriver } = require('./helpers/game-driver.js');

const TREE_PASS_ONCE = [
  { x: 180, y: 280 },
  { x: 430, y: 280 },
];

const TREE_PASS_TWICE = [
  { x: 180, y: 280 },
  { x: 430, y: 280 },
  { x: 180, y: 280 },
];

const OUT_OF_BOUNDS_PATH = [
  { x: 180, y: 180 },
  { x: 180, y: 70 },
  { x: 280, y: 70 },
  { x: 280, y: 180 },
];

async function advanceUntil(driver, predicate, { maxSteps = 260, stepMs = 60 } = {}) {
  for (let i = 0; i < maxSteps; i += 1) {
    const state = await driver.readState();
    if (predicate(state)) {
      return state;
    }
    await driver.advance(stepMs);
  }
  return driver.readState();
}

async function runAcceptedPath(driver, points) {
  await driver.drawPath(points);
  let state = await driver.readState();
  expect(state.mode).toBe('review');
  await driver.clickReviewButton('Accept');
  state = await driver.readState();
  expect(state.mode).toBe('animating');
  return state;
}

test('crash applies flip, popup, and one penalty during continuous overlap', async ({ page }) => {
  const driver = createGameDriver(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await driver.waitForRenderApi();

  await runAcceptedPath(driver, TREE_PASS_ONCE);

  let state = await advanceUntil(
    driver,
    (snapshot) => snapshot.playback.flip_active === true,
    { maxSteps: 220, stepMs: 40 }
  );

  expect(state.playback.flip_active).toBe(true);
  expect(state.economy.total_crashes).toBe(1);
  expect(state.economy.cash).toBe(-1);
  expect(state.effects.active_penalty_popups).toBeGreaterThan(0);

  const crashCount = state.economy.total_crashes;
  await driver.advance(120);
  state = await driver.readState();
  expect(state.economy.total_crashes).toBe(crashCount);

  driver.expectNoConsoleErrors();
});

test('re-entering an obstacle in one route charges again', async ({ page }) => {
  const driver = createGameDriver(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await driver.waitForRenderApi();

  await runAcceptedPath(driver, TREE_PASS_TWICE);

  const state = await advanceUntil(driver, (snapshot) => snapshot.mode !== 'animating', {
    maxSteps: 500,
    stepMs: 60,
  });

  expect(['drawing', 'won']).toContain(state.mode);
  expect(state.economy.total_crashes).toBeGreaterThanOrEqual(2);
  expect(state.economy.cash).toBeLessThanOrEqual(-2);

  driver.expectNoConsoleErrors();
});

test('out-of-bounds path is clamped and does not trigger boundary penalty', async ({ page }) => {
  const driver = createGameDriver(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await driver.waitForRenderApi();

  await runAcceptedPath(driver, OUT_OF_BOUNDS_PATH);

  const state = await advanceUntil(driver, (snapshot) => snapshot.mode !== 'animating', {
    maxSteps: 500,
    stepMs: 60,
  });

  expect(['drawing', 'won']).toContain(state.mode);
  expect(state.economy.total_crashes).toBe(0);
  expect(state.economy.cash).toBe(0);
  expect(state.collision_debug.overlapping_obstacle_ids).toEqual([]);

  const minY = state.map.lawn.y + state.mower.body_radius;
  expect(state.mower.y).toBeGreaterThanOrEqual(minY - 0.01);

  driver.expectNoConsoleErrors();
});
