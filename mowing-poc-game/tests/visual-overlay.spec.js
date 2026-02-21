const { test, expect } = require('playwright/test');
const { createGameDriver } = require('./helpers/game-driver.js');

function colorDelta(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

test('drawing shows both brush overlay and distinct centerline', async ({ page }) => {
  const driver = createGameDriver(page);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await driver.waitForRenderApi();

  const center = { x: 420, y: 200 };
  const brushOnly = { x: 420, y: 216 };
  const outside = { x: 420, y: 260 };

  const baselineCenter = await driver.sampleCanvasPixel(center);
  const baselineBrushOnly = await driver.sampleCanvasPixel(brushOnly);
  const baselineOutside = await driver.sampleCanvasPixel(outside);

  const start = await driver.worldToClient({ x: 220, y: 200 });
  const mid = await driver.worldToClient({ x: 420, y: 200 });
  const end = await driver.worldToClient({ x: 620, y: 200 });

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(mid.x, mid.y, { steps: 12 });
  await page.mouse.move(end.x, end.y, { steps: 12 });

  await page.waitForTimeout(20);

  const duringCenter = await driver.sampleCanvasPixel(center);
  const duringBrushOnly = await driver.sampleCanvasPixel(brushOnly);
  const duringOutside = await driver.sampleCanvasPixel(outside);

  const centerChange = colorDelta(duringCenter, baselineCenter);
  const brushChange = colorDelta(duringBrushOnly, baselineBrushOnly);
  const outsideChange = colorDelta(duringOutside, baselineOutside);
  const centerVsBrush = colorDelta(duringCenter, duringBrushOnly);

  expect(centerChange).toBeGreaterThan(25);
  expect(brushChange).toBeGreaterThan(18);
  expect(outsideChange).toBeLessThan(12);
  expect(centerVsBrush).toBeGreaterThan(16);

  await page.mouse.up({ button: 'left' });

  const state = await driver.readState();
  expect(state.mode).toBe('review');

  driver.expectNoConsoleErrors();
});
