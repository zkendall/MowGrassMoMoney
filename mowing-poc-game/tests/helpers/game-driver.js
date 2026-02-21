const { expect } = require('playwright/test');

function createGameDriver(page) {
  const errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({ type: 'console.error', text: msg.text() });
    }
  });

  page.on('pageerror', (error) => {
    errors.push({ type: 'pageerror', text: String(error) });
  });

  async function waitForRenderApi(timeoutMs = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const ready = await page.evaluate(() => (
        typeof window.render_game_to_text === 'function'
        && typeof window.advanceTime === 'function'
      ));
      if (ready) {
        return;
      }
      await page.waitForTimeout(20);
    }
    throw new Error('render_game_to_text/advanceTime unavailable');
  }

  async function readState() {
    const raw = await page.evaluate(() => {
      if (typeof window.render_game_to_text !== 'function') return null;
      return window.render_game_to_text();
    });
    if (!raw) {
      throw new Error('render_game_to_text unavailable');
    }
    return JSON.parse(raw);
  }

  async function advance(ms) {
    await page.evaluate((advanceMs) => {
      if (typeof window.advanceTime !== 'function') {
        throw new Error('advanceTime unavailable');
      }
      window.advanceTime(advanceMs);
    }, ms);
  }

  async function worldToClient(point) {
    return page.evaluate(({ x, y }) => {
      const canvas = document.getElementById('game');
      if (!canvas) {
        throw new Error('Canvas #game not found');
      }
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (x / canvas.width) * rect.width,
        y: rect.top + (y / canvas.height) * rect.height,
      };
    }, point);
  }

  async function drawPath(points) {
    if (!Array.isArray(points) || points.length < 2) {
      throw new Error('drawPath requires at least 2 points');
    }

    const first = await worldToClient(points[0]);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down({ button: 'left' });

    for (let i = 1; i < points.length; i += 1) {
      const pt = await worldToClient(points[i]);
      await page.mouse.move(pt.x, pt.y, { steps: 2 });
    }

    await page.mouse.up({ button: 'left' });
  }

  async function clickReviewButton(label) {
    const state = await readState();
    const buttons = state.review?.buttons || [];
    const button = buttons.find((candidate) => (
      String(candidate.label || '').toLowerCase() === label.toLowerCase()
    ));

    if (!button) {
      throw new Error(`Review button not found: ${label}`);
    }
    if (!button.enabled) {
      throw new Error(`Review button disabled: ${label}`);
    }

    const target = {
      x: button.x + button.w * 0.5,
      y: button.y + button.h * 0.5,
    };
    const client = await worldToClient(target);
    await page.mouse.click(client.x, client.y, { button: 'left' });
  }

  async function sampleCanvasPixel(point) {
    return page.evaluate(({ x, y }) => {
      const canvas = document.getElementById('game');
      if (!canvas) {
        throw new Error('Canvas #game not found');
      }
      const context = canvas.getContext('2d');
      const data = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return [data[0], data[1], data[2], data[3]];
    }, point);
  }

  function expectNoConsoleErrors() {
    expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
  }

  function getErrors() {
    return errors.slice();
  }

  return {
    waitForRenderApi,
    readState,
    advance,
    drawPath,
    clickReviewButton,
    expectNoConsoleErrors,
    sampleCanvasPixel,
    worldToClient,
    getErrors,
  };
}

module.exports = {
  createGameDriver,
};
