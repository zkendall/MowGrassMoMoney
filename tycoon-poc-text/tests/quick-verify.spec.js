const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('playwright/test');
const { writeSummary } = require('./helpers/summarize-verify-states.js');
const { loadScenarioFromFixture, buildScenarioUrl } = require('./harness/scenario.js');
const { createRuntime } = require('./harness/runtime.js');
const { runSteps } = require('./harness/steps.js');
const { timestampRunId } = require('./harness/artifacts.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(ROOT_DIR, 'output');
const VERIFY_LABEL = 'verify';
const HEADED_ACTION_DELAY_MS = 450;
const DEFAULT_START_STATE = 'default';
const QUICK_STEP_PLANS_PATH = path.join(__dirname, 'fixtures', 'quick-verify-step-plans.json');

test('quick_verify_walkthrough', async ({ page }, testInfo) => {
  const scenario = loadScenarioFromFixture({
    fixturePath: QUICK_STEP_PLANS_PATH,
    scenarioName: 'quick_verify_walkthrough',
    defaultSeed: null,
    defaultStartState: DEFAULT_START_STATE,
  });
  const baseURL = testInfo.project.use.baseURL || 'http://127.0.0.1:4174';
  const verifyUrl = buildScenarioUrl(baseURL, scenario, DEFAULT_START_STATE);
  const runId = timestampRunId();
  const webGameDir = path.join(OUTPUT_ROOT, `${runId}-${VERIFY_LABEL}-web-game`);
  const probePath = path.join(OUTPUT_ROOT, `${runId}-${VERIFY_LABEL}-probe.json`);
  const errors = [];

  fs.mkdirSync(webGameDir, { recursive: true });

  const isHeadless = testInfo.project.use.headless !== false;
  const runtime = createRuntime({
    page,
    isHeadless,
    actionDelayMsHeaded: HEADED_ACTION_DELAY_MS,
    pollDelayMsHeaded: 60,
    pollDelayMsHeadless: 10,
  });
  const {
    actionDelayMs,
    readState,
    waitForRenderApi,
    waitForMode,
    press,
    moveDayActionCursorTo,
    completeProcessing,
  } = runtime;

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({ type: 'console.error', text: msg.text() });
    }
  });
  page.on('pageerror', (error) => {
    errors.push({ type: 'pageerror', text: String(error) });
  });

  async function executeStep(step) {
    const times = Number.isFinite(step.times) ? step.times : 1;

    if (step.op === 'press') {
      const waitMs = Number.isFinite(step.wait_ms) ? step.wait_ms : actionDelayMs;
      for (let i = 0; i < times; i += 1) {
        await press(step.key, waitMs);
      }
      return;
    }

    if (step.op === 'wait_mode') {
      await waitForMode(step.mode, step.timeout_ms || 6000);
      return;
    }

    if (step.op === 'assert_mode') {
      const state = await readState();
      expect(state.mode).toBe(step.mode);
      return;
    }

    if (step.op === 'move_day_action_cursor') {
      await moveDayActionCursorTo(step.cursor);
      return;
    }

    if (step.op === 'complete_processing') {
      await completeProcessing({
        durationMs: step.duration_ms || 1200,
        requireConfirm: step.require_confirm !== false,
        confirmWaitMs: 350,
        waitPolicy: 'headed-only',
      });
      return;
    }

    if (step.op === 'select_planning_jobs_up_to') {
      const planning = await waitForMode('planning');
      const maxSelections = Math.min(step.max || 1, (planning.planning_jobs || []).length);
      const toggleWaitMs = Number.isFinite(step.toggle_wait_ms) ? step.toggle_wait_ms : actionDelayMs;
      const moveWaitMs = Number.isFinite(step.move_wait_ms) ? step.move_wait_ms : actionDelayMs;
      for (let i = 0; i < maxSelections; i += 1) {
        await press('Space', toggleWaitMs);
        if (i < maxSelections - 1) {
          await press('ArrowDown', moveWaitMs);
        }
      }
      return;
    }

    if (step.op === 'accept_first_pending_offer_if_any') {
      const state = await readState();
      if ((state.pending_regular_offers || []).length > 0) {
        const waitMs = Number.isFinite(step.wait_ms) ? step.wait_ms : actionDelayMs;
        await press('Space', waitMs);
      }
      return;
    }

    if (step.op === 'assert_last_report_activity') {
      const state = await readState();
      expect(state.last_report?.activity).toBe(step.activity);
      return;
    }

    throw new Error(`Unknown quick-verify step op: ${step.op}`);
  }

  await page.goto(verifyUrl, { waitUntil: 'domcontentloaded' });
  await waitForRenderApi();
  if (!isHeadless) {
    await page.waitForTimeout(700);
  }

  await runSteps(scenario.steps, executeStep);

  await page.screenshot({ path: path.join(webGameDir, 'shot-0.png'), fullPage: true });
  const stateText = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== 'function') return null;
    return window.render_game_to_text();
  });

  if (!stateText) {
    throw new Error('render_game_to_text unavailable');
  }

  fs.writeFileSync(path.join(webGameDir, 'state-0.json'), stateText);
  if (errors.length) {
    fs.writeFileSync(path.join(webGameDir, 'errors-0.json'), JSON.stringify(errors, null, 2));
  }

  const finalState = JSON.parse(stateText);
  expect(finalState.mode).toBe('report');
  expect(finalState.last_report?.activity).toBe('shop_hardware');
  expect(errors).toEqual([]);

  const summary = writeSummary(webGameDir, probePath, runId, VERIFY_LABEL);
  expect(summary.last_report_activity).toBe('shop_hardware');

  console.log(`[verify-tycoon-quick] URL: ${verifyUrl}`);
  console.log(`[verify-tycoon-quick] Run: ${runId}`);
  console.log(`[verify-tycoon-quick] Label: ${VERIFY_LABEL}`);
  console.log(`[verify-tycoon-quick] Browser: ${isHeadless ? 'headless' : 'headed'}`);
  console.log(`[verify-tycoon-quick] Output root: ${OUTPUT_ROOT}`);
  console.log('[verify-tycoon-quick] Done.');
  console.log('[verify-tycoon-quick] Artifacts:');
  console.log(`  - ${webGameDir}`);
  console.log(`  - ${probePath}`);
});
