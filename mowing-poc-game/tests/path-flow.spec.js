const { test, expect } = require('playwright/test');
const { createGameDriver } = require('./helpers/game-driver.js');

const SAFE_PATH_A = [
  { x: 190, y: 180 },
  { x: 760, y: 180 },
];

const SAFE_PATH_B = [
  { x: 190, y: 200 },
  { x: 760, y: 200 },
];

async function advanceUntil(driver, predicate, { maxSteps = 200, stepMs = 60 } = {}) {
  for (let i = 0; i < maxSteps; i += 1) {
    const state = await driver.readState();
    if (predicate(state)) {
      return state;
    }
    await driver.advance(stepMs);
  }
  return driver.readState();
}

test('drawing -> review -> retry -> drawing -> accept -> animating -> complete', async ({ page }) => {
  const driver = createGameDriver(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await driver.waitForRenderApi();

  let state = await driver.readState();
  expect(state.mode).toBe('start');

  await driver.drawPath(SAFE_PATH_A);
  state = await driver.readState();
  expect(state.mode).toBe('review');
  expect(state.planning.point_count).toBeGreaterThan(1);
  expect(state.review.mode_active).toBe(true);

  await driver.clickReviewButton('Retry');
  state = await driver.readState();
  expect(state.mode).toBe('drawing');
  expect(state.planning.point_count).toBe(0);

  await driver.drawPath(SAFE_PATH_B);
  state = await driver.readState();
  expect(state.mode).toBe('review');

  await driver.clickReviewButton('Accept');
  state = await driver.readState();
  expect(state.mode).toBe('animating');

  const startProgress = state.playback.progress_0_to_1;
  const startCoverage = state.coverage_percent;

  await driver.advance(1000);
  state = await driver.readState();
  expect(state.mode).toBe('animating');
  expect(state.playback.progress_0_to_1).toBeGreaterThan(startProgress);
  expect(state.coverage_percent).toBeGreaterThan(startCoverage);

  state = await advanceUntil(driver, (snapshot) => snapshot.mode !== 'animating', {
    maxSteps: 300,
    stepMs: 60,
  });

  expect(['drawing', 'won']).toContain(state.mode);
  driver.expectNoConsoleErrors();
});

test('holding Space fast-forwards mower playback speed', async ({ page }) => {
  const driver = createGameDriver(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await driver.waitForRenderApi();

  const longPath = [
    { x: 190, y: 180 },
    { x: 760, y: 180 },
    { x: 760, y: 560 },
  ];

  await driver.drawPath(longPath);
  await driver.clickReviewButton('Accept');

  let state = await driver.readState();
  expect(state.mode).toBe('animating');

  const startProgress = state.playback.progress_0_to_1;
  await driver.advance(400);
  state = await driver.readState();
  const normalDelta = state.playback.progress_0_to_1 - startProgress;

  await page.keyboard.down('Space');
  const fastStart = state.playback.progress_0_to_1;
  await driver.advance(400);
  await page.keyboard.up('Space');
  await driver.advance(16);
  state = await driver.readState();

  const fastDelta = state.playback.progress_0_to_1 - fastStart;
  expect(state.input.fast_forward).toBe(false);
  expect(state.playback.effective_speed_px_per_sec).toBe(state.playback.speed_px_per_sec);
  expect(fastDelta).toBeGreaterThan(normalDelta * 1.8);

  driver.expectNoConsoleErrors();
});
