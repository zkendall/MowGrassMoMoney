#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const GOLDEN_DIR = path.join(ROOT_DIR, 'tests', 'golden');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output', 'regression-tests');
const STEP_PLANS_PATH = path.join(ROOT_DIR, 'scripts', 'regression-step-plans.json');
const STEP_PLANS = JSON.parse(fs.readFileSync(STEP_PLANS_PATH, 'utf8'));

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:4174',
    updateGolden: false,
    headless: true,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--url' && next) {
      args.url = next;
      i += 1;
    } else if (arg === '--update-golden') {
      args.updateGolden = true;
    } else if (arg === '--headed') {
      args.headless = false;
    } else if (arg === '--headless') {
      if (!next) {
        throw new Error('--headless requires true/false');
      }
      const normalized = String(next).trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        args.headless = true;
      } else if (normalized === 'false' || normalized === '0') {
        args.headless = false;
      } else {
        throw new Error('--headless must be true/false (or 1/0)');
      }
      i += 1;
    }
  }
  return args;
}

function withSeed(baseUrl, seed) {
  const parsed = new URL(baseUrl);
  parsed.searchParams.set('seed', String(seed));
  return parsed.toString();
}

async function readState(page) {
  const raw = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== 'function') return null;
    return window.render_game_to_text();
  });
  if (!raw) {
    throw new Error('render_game_to_text returned empty payload');
  }
  return JSON.parse(raw);
}

function stableSortById(list) {
  return [...list].sort((a, b) => a.id - b.id);
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

async function waitForMode(page, mode, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await readState(page);
    if (state.mode === mode) return state;
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for mode=${mode}`);
}

async function waitForModeNot(page, mode, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await readState(page);
    if (state.mode !== mode) return state;
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for mode!=${mode}`);
}

async function completeProcessing(page, durationMs, requireConfirm) {
  await waitForMode(page, 'processing');
  await page.waitForTimeout(durationMs + 200);
  if (requireConfirm) {
    await page.keyboard.press('Enter');
  }
  return waitForModeNot(page, 'processing', 6000);
}

async function openSeededPage(browser, baseUrl, seed) {
  const page = await browser.newPage();
  await page.goto(withSeed(baseUrl, seed), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  return page;
}

async function executeStep(page, step) {
  const times = Number.isFinite(step.times) ? step.times : 1;

  if (step.op === 'press') {
    for (let i = 0; i < times; i += 1) {
      await page.keyboard.press(step.key);
    }
    return;
  }

  if (step.op === 'set_leads') {
    await page.evaluate(({ count, status }) => window.__tycoonTestSetLeads({ count, status }), {
      count: step.count,
      status: step.status,
    });
    return;
  }

  if (step.op === 'wait_mode') {
    await waitForMode(page, step.mode, step.timeout_ms || 6000);
    return;
  }

  if (step.op === 'assert_mode') {
    const state = await readState(page);
    if (state.mode !== step.mode) {
      throw new Error(`Expected mode=${step.mode}, got ${state.mode}`);
    }
    return;
  }

  if (step.op === 'complete_processing') {
    await completeProcessing(page, step.duration_ms, step.require_confirm);
    return;
  }

  if (step.op === 'assert_min_planning_jobs') {
    const state = await readState(page);
    const jobCount = (state.planning_jobs || []).length;
    if (jobCount < step.min) {
      throw new Error(`Expected at least ${step.min} planning jobs, got ${jobCount}`);
    }
    return;
  }

  if (step.op === 'assert_last_report_activity') {
    const state = await readState(page);
    const activity = state.last_report?.activity;
    if (activity !== step.activity) {
      throw new Error(`Expected report activity=${step.activity}, got ${activity}`);
    }
    return;
  }

  if (step.op === 'assert_pending_offers') {
    const state = await readState(page);
    const offerCount = (state.pending_regular_offers || []).length;
    if (offerCount < step.min) {
      throw new Error(`Expected at least ${step.min} pending offers, got ${offerCount}`);
    }
    return;
  }

  if (step.op === 'assert_repeat_customers') {
    const state = await readState(page);
    const repeatCount = (state.repeat_customers || []).length;
    if (repeatCount < step.min) {
      throw new Error(`Expected at least ${step.min} repeat customers, got ${repeatCount}`);
    }
    return;
  }

  throw new Error(`Unknown regression step op: ${step.op}`);
}

async function executePlan(page, planName) {
  const steps = STEP_PLANS[planName];
  if (!Array.isArray(steps)) {
    throw new Error(`Missing step plan: ${planName}`);
  }
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    try {
      await executeStep(page, step);
    } catch (error) {
      const prefix = `Step ${i + 1}/${steps.length}${step.desc ? ` (${step.desc})` : ''}`;
      throw new Error(`${prefix} failed: ${error.message || error}`);
    }
  }
}

async function scenarioSolicitReport(browser, baseUrl) {
  const seed = 2;
  const page = await openSeededPage(browser, baseUrl, seed);
  await executePlan(page, 'solicit_report');
  const result = await readState(page);

  await page.close();
  return pickScenarioSnapshot('solicit_report', result);
}

async function scenarioFollowUpReport(browser, baseUrl) {
  const seed = 2;
  const page = await openSeededPage(browser, baseUrl, seed);
  await executePlan(page, 'follow_up_report');
  const result = await readState(page);

  await page.close();
  return pickScenarioSnapshot('follow_up_report', result);
}

async function scenarioMowOfferAccept(browser, baseUrl) {
  const seed = 2;
  const page = await openSeededPage(browser, baseUrl, seed);
  await executePlan(page, 'mow_offer_accept');
  const dayStart = await readState(page);

  await page.close();
  return pickScenarioSnapshot('mow_offer_accept', dayStart);
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

function assertEqual(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${name} failed golden comparison`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const browser = await chromium.launch({
    headless: args.headless,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });

  try {
    const scenarios = [
      ['solicit_report', scenarioSolicitReport],
      ['follow_up_report', scenarioFollowUpReport],
      ['mow_offer_accept', scenarioMowOfferAccept],
    ];

    const actual = {};
    for (const [name, runner] of scenarios) {
      actual[name] = await runner(browser, args.url);
      if (args.updateGolden) {
        writeExpected(name, actual[name]);
      } else {
        const expected = readExpected(name);
        if (!expected) {
          throw new Error(`Missing golden file: tests/golden/${name}.json`);
        }
        assertEqual(name, actual[name], expected);
      }
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'latest-summary.json'),
      JSON.stringify({
        url: args.url,
        update_golden: args.updateGolden,
        scenarios: actual,
      }, null, 2),
    );

    console.log(JSON.stringify({
      status: 'ok',
      scenarios: Object.keys(actual),
      headless: args.headless,
      summary: path.join(OUTPUT_DIR, 'latest-summary.json'),
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
