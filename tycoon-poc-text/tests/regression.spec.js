const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('playwright/test');
const { loadScenarioFromFixture, buildScenarioUrl } = require('./harness/scenario.js');
const { createRuntime } = require('./harness/runtime.js');
const { runSteps } = require('./harness/steps.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const STEP_PLANS_PATH = path.join(__dirname, 'fixtures', 'regression-step-plans.json');
const GOLDEN_DIR = path.join(__dirname, 'golden');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output', 'regression-tests');
const SUMMARY_PATH = path.join(OUTPUT_DIR, 'latest-summary.json');
const HEADED_ACTION_DELAY_MS = 180;
const UPDATE_GOLDEN = ['1', 'true', 'yes'].includes(
  String(process.env.UPDATE_GOLDEN || '').toLowerCase(),
);
const DEFAULT_START_STATE = 'default';

const scenarioResults = {};

function stableSortById(list) {
  return [...list].sort((a, b) => a.id - b.id);
}

function summaryPayload() {
  return {
    url: process.env.TYCOON_BASE_URL || 'http://127.0.0.1:4174',
    update_golden: UPDATE_GOLDEN,
    scenarios: scenarioResults,
  };
}

function writeSummary() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summaryPayload(), null, 2));
}

function readScenarioConfig(name) {
  return loadScenarioFromFixture({
    fixturePath: STEP_PLANS_PATH,
    scenarioName: name,
    defaultSeed: 2,
    defaultStartState: DEFAULT_START_STATE,
  });
}

function readExpected(name) {
  const expectedPath = path.join(GOLDEN_DIR, `${name}.json`);
  if (!fs.existsSync(expectedPath)) return null;
  return JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
}

function writeExpected(name, payload) {
  const expectedPath = path.join(GOLDEN_DIR, `${name}.json`);
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  fs.writeFileSync(expectedPath, JSON.stringify(payload, null, 2));
}

async function openScenarioPage(page, baseURL, scenario) {
  const url = buildScenarioUrl(baseURL, scenario, DEFAULT_START_STATE);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
}

async function executeStep(page, runtime, step) {
  const times = Number.isFinite(step.times) ? step.times : 1;

  if (step.op === 'press') {
    for (let i = 0; i < times; i += 1) {
      await runtime.press(step.key);
    }
    return;
  }

  if (step.op === 'set_leads') {
    await page.evaluate(({ count, status }) => {
      if (typeof window.__tycoonTestSetLeads !== 'function') {
        throw new Error('__tycoonTestSetLeads unavailable');
      }
      window.__tycoonTestSetLeads({ count, status });
    }, {
      count: step.count,
      status: step.status,
    });
    return;
  }

  if (step.op === 'wait_mode') {
    await runtime.waitForMode(step.mode, step.timeout_ms || 6_000);
    return;
  }

  if (step.op === 'assert_mode') {
    const state = await runtime.readState();
    expect(state.mode).toBe(step.mode);
    return;
  }

  if (step.op === 'complete_processing') {
    await runtime.completeProcessing({
      durationMs: step.duration_ms,
      requireConfirm: step.require_confirm,
      confirmWaitMs: 0,
      waitPolicy: 'always',
      waitPaddingMs: 200,
    });
    return;
  }

  if (step.op === 'assert_min_planning_jobs') {
    const state = await runtime.readState();
    expect((state.planning_jobs || []).length).toBeGreaterThanOrEqual(step.min);
    return;
  }

  if (step.op === 'assert_last_report_activity') {
    const state = await runtime.readState();
    expect(state.last_report?.activity).toBe(step.activity);
    return;
  }

  if (step.op === 'assert_pending_offers') {
    const state = await runtime.readState();
    expect((state.pending_regular_offers || []).length).toBeGreaterThanOrEqual(step.min);
    return;
  }

  if (step.op === 'assert_repeat_customers') {
    const state = await runtime.readState();
    expect((state.repeat_customers || []).length).toBeGreaterThanOrEqual(step.min);
    return;
  }

  throw new Error(`Unknown regression step op: ${step.op}`);
}

async function executePlan(page, runtime, steps) {
  await runSteps(steps, async (step) => {
    await executeStep(page, runtime, step);
  });
}

function pickScenarioSnapshot(name, state) {
  if (name === 'solicit_report') {
    return {
      seed: state.seed,
      mode: state.mode,
      day: state.day,
      cash: state.cash,
      leads: stableSortById(state.leads).map((lead) => ({
        id: lead.id,
        lead_status: lead.lead_status,
        pattern_preference: lead.pattern_preference,
      })),
      last_report: {
        activity: state.last_report?.activity,
        materials: state.last_report?.materials,
        leads_generated: [...(state.last_report?.leads_generated || [])].sort(),
        endingCash: state.last_report?.endingCash,
      },
    };
  }

  if (name === 'follow_up_report') {
    return {
      seed: state.seed,
      mode: state.mode,
      day: state.day,
      cash: state.cash,
      leads: stableSortById(state.leads).map((lead) => ({
        id: lead.id,
        lead_status: lead.lead_status,
      })),
      last_report: {
        activity: state.last_report?.activity,
        leads_qualified: [...(state.last_report?.leads_qualified || [])].sort(),
        endingCash: state.last_report?.endingCash,
      },
    };
  }

  if (name === 'mow_offer_accept') {
    return {
      seed: state.seed,
      mode: state.mode,
      day: state.day,
      cash: state.cash,
      mower_tier: state.mower_tier,
      repeat_customers: stableSortById(state.repeat_customers).map((customer) => ({
        id: customer.id,
        days_since_service: customer.days_since_service,
        pattern_preference: customer.pattern_preference,
      })),
      leads: stableSortById(state.leads).map((lead) => ({
        id: lead.id,
        lead_status: lead.lead_status,
      })),
    };
  }

  throw new Error(`Unknown scenario: ${name}`);
}

function assertOrUpdateGolden(name, actual) {
  if (UPDATE_GOLDEN) {
    writeExpected(name, actual);
    return;
  }
  const expected = readExpected(name);
  if (!expected) {
    throw new Error(`Missing golden file: tests/golden/${name}.json`);
  }
  expect(actual).toEqual(expected);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  writeSummary();
});

test.afterEach(() => {
  writeSummary();
});

test.afterAll(() => {
  writeSummary();
});

test('solicit_report', async ({ page }) => {
  const scenario = readScenarioConfig('solicit_report');
  const isHeadless = test.info().project.use.headless !== false;
  const baseURL = test.info().project.use.baseURL || 'http://127.0.0.1:4174';
  const runtime = createRuntime({
    page,
    isHeadless,
    actionDelayMsHeaded: HEADED_ACTION_DELAY_MS,
    pollDelayMsHeaded: 50,
    pollDelayMsHeadless: 50,
  });
  await openScenarioPage(page, baseURL, scenario);
  await executePlan(page, runtime, scenario.steps);
  const result = await runtime.readState();
  const snapshot = pickScenarioSnapshot('solicit_report', result);
  assertOrUpdateGolden('solicit_report', snapshot);
  scenarioResults.solicit_report = snapshot;
});

test('follow_up_report', async ({ page }) => {
  const scenario = readScenarioConfig('follow_up_report');
  const isHeadless = test.info().project.use.headless !== false;
  const baseURL = test.info().project.use.baseURL || 'http://127.0.0.1:4174';
  const runtime = createRuntime({
    page,
    isHeadless,
    actionDelayMsHeaded: HEADED_ACTION_DELAY_MS,
    pollDelayMsHeaded: 50,
    pollDelayMsHeadless: 50,
  });
  await openScenarioPage(page, baseURL, scenario);
  await executePlan(page, runtime, scenario.steps);
  const result = await runtime.readState();
  const snapshot = pickScenarioSnapshot('follow_up_report', result);
  assertOrUpdateGolden('follow_up_report', snapshot);
  scenarioResults.follow_up_report = snapshot;
});

test('mow_offer_accept', async ({ page }) => {
  const scenario = readScenarioConfig('mow_offer_accept');
  const isHeadless = test.info().project.use.headless !== false;
  const baseURL = test.info().project.use.baseURL || 'http://127.0.0.1:4174';
  const runtime = createRuntime({
    page,
    isHeadless,
    actionDelayMsHeaded: HEADED_ACTION_DELAY_MS,
    pollDelayMsHeaded: 50,
    pollDelayMsHeadless: 50,
  });
  await openScenarioPage(page, baseURL, scenario);
  await executePlan(page, runtime, scenario.steps);
  const result = await runtime.readState();
  const snapshot = pickScenarioSnapshot('mow_offer_accept', result);
  assertOrUpdateGolden('mow_offer_accept', snapshot);
  scenarioResults.mow_offer_accept = snapshot;
});
