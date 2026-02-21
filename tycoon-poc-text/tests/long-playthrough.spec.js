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
const VERIFY_LABEL = 'long';
const HEADED_ACTION_DELAY_MS = 450;
const DEFAULT_START_STATE = 'default';
const LONG_STEP_PLANS_PATH = path.join(__dirname, 'fixtures', 'long-playthrough-step-plans.json');

test('long_full_playthrough', async ({ page }, testInfo) => {
  const scenario = loadScenarioFromFixture({
    fixturePath: LONG_STEP_PLANS_PATH,
    scenarioName: 'long_full_playthrough',
    defaultSeed: null,
    defaultStartState: DEFAULT_START_STATE,
  });
  const baseURL = testInfo.project.use.baseURL || 'http://127.0.0.1:4174';
  const verifyUrl = buildScenarioUrl(baseURL, scenario, DEFAULT_START_STATE);
  const runId = timestampRunId();
  const webGameDir = path.join(OUTPUT_ROOT, `${runId}-${VERIFY_LABEL}-web-game`);
  const probePath = path.join(OUTPUT_ROOT, `${runId}-${VERIFY_LABEL}-probe.json`);
  const errors = [];
  const activitiesSeen = new Set();

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
    waitForModeNot,
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

  function rememberReportActivity(state) {
    if (state?.mode !== 'report') return;
    const activity = state.last_report?.activity;
    if (typeof activity === 'string' && activity) {
      activitiesSeen.add(activity);
    }
  }

  function countLeadsByStatus(state, status) {
    return (state.leads || []).filter((lead) => lead.lead_status === status).length;
  }

  async function advanceReportToNextDay() {
    await waitForMode('report');
    await press('Enter', 450);
    await waitForMode('day_action');
  }

  async function ensureDayAction() {
    const state = await readState();
    if (state.mode === 'day_action') {
      return state;
    }
    if (state.mode === 'report') {
      rememberReportActivity(state);
      await advanceReportToNextDay();
      return waitForMode('day_action');
    }
    if (state.mode === 'processing') {
      await waitForModeNot('processing');
      return ensureDayAction();
    }
    throw new Error(`Cannot continue day action flow from mode=${state.mode}`);
  }

  async function solicitUntilRawLeads(step) {
    const minRawLeads = Number.isFinite(step.min_raw_leads) ? step.min_raw_leads : 1;
    const maxAttempts = Number.isFinite(step.max_attempts) ? step.max_attempts : 6;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await ensureDayAction();
      await moveDayActionCursorTo(0);
      await press('Enter');
      await completeProcessing({
        durationMs: step.duration_ms || 1200,
        requireConfirm: true,
        confirmWaitMs: 350,
        waitPolicy: 'headed-only',
      });
      const report = await waitForMode('report');
      rememberReportActivity(report);

      const rawCount = countLeadsByStatus(report, 'raw');
      if (rawCount >= minRawLeads) {
        return;
      }

      await advanceReportToNextDay();
    }

    const state = await readState();
    throw new Error(
      `Solicit loop exhausted (${maxAttempts} attempts). raw leads=${countLeadsByStatus(state, 'raw')}`,
    );
  }

  async function followUpUntilQualifiedLeads(step) {
    const minQualifiedLeads = Number.isFinite(step.min_qualified_leads) ? step.min_qualified_leads : 1;
    const maxAttempts = Number.isFinite(step.max_attempts) ? step.max_attempts : 6;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await ensureDayAction();
      await moveDayActionCursorTo(1);
      await press('Enter');
      await completeProcessing({
        durationMs: step.duration_ms || 1000,
        requireConfirm: true,
        confirmWaitMs: 350,
        waitPolicy: 'headed-only',
      });
      const report = await waitForMode('report');
      rememberReportActivity(report);

      const qualifiedCount = countLeadsByStatus(report, 'qualified');
      if (qualifiedCount >= minQualifiedLeads) {
        return;
      }

      await advanceReportToNextDay();
    }

    const state = await readState();
    throw new Error(
      `Follow-up loop exhausted (${maxAttempts} attempts). qualified leads=${countLeadsByStatus(state, 'qualified')}`,
    );
  }

  async function mowUntilRepeatCustomers(step) {
    const minRepeatCustomers = Number.isFinite(step.min_repeat_customers) ? step.min_repeat_customers : 1;
    const maxAttempts = Number.isFinite(step.max_attempts) ? step.max_attempts : 3;
    const maxJobSelect = Number.isFinite(step.max_job_select) ? step.max_job_select : 3;
    const scorePresses = Number.isFinite(step.score_presses) ? step.score_presses : 16;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await ensureDayAction();
      await moveDayActionCursorTo(2);
      await press('Enter');

      const planning = await waitForMode('planning');
      const planningJobCount = (planning.planning_jobs || []).length;
      if (planningJobCount < 1) {
        throw new Error('Mow flow entered planning without available jobs.');
      }

      const selectCount = Math.min(maxJobSelect, planningJobCount);
      for (let i = 0; i < selectCount; i += 1) {
        await press('Space', 300);
        if (i < selectCount - 1) {
          await press('ArrowDown', 240);
        }
      }

      await press('Enter', 450);
      await waitForMode('performance');
      for (let i = 0; i < scorePresses; i += 1) {
        await press('ArrowUp', 60);
      }
      await press('Enter', 450);
      await completeProcessing({
        durationMs: step.duration_ms || 1100,
        requireConfirm: true,
        confirmWaitMs: 350,
        waitPolicy: 'headed-only',
      });

      const report = await waitForMode('report');
      rememberReportActivity(report);
      if ((report.pending_regular_offers || []).length > 0) {
        await press('Space', 320);
      }

      await advanceReportToNextDay();
      const dayActionState = await waitForMode('day_action');
      if ((dayActionState.repeat_customers || []).length >= minRepeatCustomers) {
        return;
      }
    }

    const state = await readState();
    throw new Error(
      `Mow loop exhausted (${maxAttempts} attempts). repeat customers=${(state.repeat_customers || []).length}`,
    );
  }

  async function runHardwareShopDay(step) {
    await ensureDayAction();
    await moveDayActionCursorTo(3);
    await press('Enter');
    await completeProcessing({
      durationMs: step.to_shop_duration_ms || 900,
      requireConfirm: true,
      confirmWaitMs: 350,
      waitPolicy: 'headed-only',
    });

    await waitForMode('hardware_shop');
    if (step.shop_choice === 'skip') {
      await press('ArrowDown', 250);
    }
    await press('Enter', 450);
    await completeProcessing({
      durationMs: step.checkout_duration_ms || 900,
      requireConfirm: true,
      confirmWaitMs: 350,
      waitPolicy: 'headed-only',
    });

    const report = await waitForMode('report');
    rememberReportActivity(report);
  }

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
      const state = await waitForMode(step.mode, step.timeout_ms || 6000);
      rememberReportActivity(state);
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

    if (step.op === 'solicit_until_raw_leads') {
      await solicitUntilRawLeads(step);
      return;
    }

    if (step.op === 'follow_up_until_qualified_leads') {
      await followUpUntilQualifiedLeads(step);
      return;
    }

    if (step.op === 'mow_until_repeat_customers') {
      await mowUntilRepeatCustomers(step);
      return;
    }

    if (step.op === 'shop_hardware_day') {
      await runHardwareShopDay(step);
      return;
    }

    if (step.op === 'assert_last_report_activity') {
      const state = await readState();
      expect(state.last_report?.activity).toBe(step.activity);
      return;
    }

    if (step.op === 'assert_report_activities_seen') {
      const required = Array.isArray(step.activities) ? step.activities : [];
      for (const activity of required) {
        if (!activitiesSeen.has(activity)) {
          throw new Error(
            `Expected report activity "${activity}" to be seen. Seen: ${Array.from(activitiesSeen).join(', ') || 'none'}`,
          );
        }
      }
      return;
    }

    throw new Error(`Unknown long-playthrough step op: ${step.op}`);
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
  expect((finalState.repeat_customers || []).length).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);

  const summary = writeSummary(webGameDir, probePath, runId, VERIFY_LABEL);
  expect(summary.last_report_activity).toBe('shop_hardware');

  console.log(`[verify-tycoon-long] URL: ${verifyUrl}`);
  console.log(`[verify-tycoon-long] Run: ${runId}`);
  console.log(`[verify-tycoon-long] Label: ${VERIFY_LABEL}`);
  console.log(`[verify-tycoon-long] Browser: ${isHeadless ? 'headless' : 'headed'}`);
  console.log(`[verify-tycoon-long] Output root: ${OUTPUT_ROOT}`);
  console.log('[verify-tycoon-long] Done.');
  console.log('[verify-tycoon-long] Artifacts:');
  console.log(`  - ${webGameDir}`);
  console.log(`  - ${probePath}`);
});
