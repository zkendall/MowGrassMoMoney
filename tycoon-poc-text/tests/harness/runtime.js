function createRuntime({
  page,
  isHeadless,
  actionDelayMsHeaded = 0,
  pollDelayMsHeaded = 60,
  pollDelayMsHeadless = 10,
}) {
  const actionDelayMs = isHeadless ? 0 : actionDelayMsHeaded;
  const pollDelayMs = isHeadless ? pollDelayMsHeadless : pollDelayMsHeaded;

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

  async function waitForRenderApi(timeoutMs = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const ready = await page.evaluate(() => typeof window.render_game_to_text === 'function');
      if (ready) return;
      await page.waitForTimeout(pollDelayMs);
    }
    throw new Error('render_game_to_text unavailable');
  }

  async function waitForMode(mode, timeoutMs = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const state = await readState();
      if (state.mode === mode) return state;
      await page.waitForTimeout(pollDelayMs);
    }
    throw new Error(`Timed out waiting for mode=${mode}`);
  }

  async function waitForModeNot(mode, timeoutMs = 6000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
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

  async function moveDayActionCursorTo(targetCursor) {
    let state = await waitForMode('day_action');
    while (state.day_action.cursor < targetCursor) {
      await press('ArrowDown');
      state = await readState();
    }
    while (state.day_action.cursor > targetCursor) {
      await press('ArrowUp');
      state = await readState();
    }
  }

  async function completeProcessing({
    durationMs = 1200,
    requireConfirm = true,
    confirmWaitMs = 350,
    waitPolicy = 'headed-only',
    waitPaddingMs = 0,
  } = {}) {
    await waitForMode('processing');
    const shouldWaitDuration = waitPolicy === 'always' || (!isHeadless && waitPolicy === 'headed-only');
    if (shouldWaitDuration && durationMs > 0) {
      await page.waitForTimeout(durationMs + waitPaddingMs);
    }
    if (requireConfirm) {
      await press('Enter', confirmWaitMs);
    }
    return waitForModeNot('processing');
  }

  return {
    actionDelayMs,
    pollDelayMs,
    readState,
    waitForRenderApi,
    waitForMode,
    waitForModeNot,
    press,
    moveDayActionCursorTo,
    completeProcessing,
  };
}

module.exports = {
  createRuntime,
};
