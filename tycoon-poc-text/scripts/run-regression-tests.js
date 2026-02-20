#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT_DIR = path.resolve(__dirname, '..');
const GOLDEN_DIR = path.join(ROOT_DIR, 'tests', 'golden');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output', 'regression-tests');

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:4174',
    updateGolden: false,
    seedMatrixOnly: false,
    seeds: [2, 17, 29, 41, 53, 67, 83, 97, 111, 131],
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--url' && next) {
      args.url = next;
      i += 1;
    } else if (arg === '--update-golden') {
      args.updateGolden = true;
    } else if (arg === '--seed-matrix-only') {
      args.seedMatrixOnly = true;
    } else if (arg === '--seeds' && next) {
      const parsed = next
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value));
      if (!parsed.length) {
        throw new Error('--seeds must contain at least one integer');
      }
      args.seeds = parsed;
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

async function scenarioSolicitReport(browser, baseUrl) {
  const seed = 2;
  const page = await openSeededPage(browser, baseUrl, seed);

  const initial = await readState(page);
  if (initial.mode !== 'day_action') {
    throw new Error(`solicit_report expected day_action, got ${initial.mode}`);
  }

  await page.keyboard.press('Enter');
  const result = await completeProcessing(page, 1200, true);
  if (result.mode !== 'report' || result.last_report?.activity !== 'solicit') {
    throw new Error('solicit_report did not finish in solicit report mode');
  }

  await page.close();
  return pickScenarioSnapshot('solicit_report', result);
}

async function scenarioFollowUpReport(browser, baseUrl) {
  const seed = 2;
  const page = await openSeededPage(browser, baseUrl, seed);

  await page.evaluate(() => window.__tycoonTestSetLeads({ count: 3, status: 'raw' }));

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const result = await completeProcessing(page, 1000, true);
  if (result.mode !== 'report' || result.last_report?.activity !== 'follow_up') {
    throw new Error('follow_up_report did not finish in follow-up report mode');
  }

  await page.close();
  return pickScenarioSnapshot('follow_up_report', result);
}

async function scenarioMowOfferAccept(browser, baseUrl) {
  const seed = 2;
  const page = await openSeededPage(browser, baseUrl, seed);
  await page.evaluate(() => window.__tycoonTestSetLeads({ count: 2, status: 'qualified' }));

  await waitForMode(page, 'day_action');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await waitForMode(page, 'planning');

  const planning = await readState(page);
  if (!planning.planning_jobs || !planning.planning_jobs.length) {
    throw new Error('mow_offer_accept scenario found no planning jobs');
  }

  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await waitForMode(page, 'performance');

  for (let i = 0; i < 22; i += 1) {
    await page.keyboard.press('ArrowUp');
  }
  await page.keyboard.press('Enter');
  const report = await completeProcessing(page, 1100, true);
  if (report.mode !== 'report' || report.last_report?.activity !== 'mow') {
    throw new Error('mow_offer_accept did not finish in mow report mode');
  }
  if (!report.pending_regular_offers || !report.pending_regular_offers.length) {
    throw new Error('mow_offer_accept expected at least one pending regular offer');
  }

  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await completeProcessing(page, 700, false);
  const dayStart = await waitForMode(page, 'day_action');

  if (!dayStart.repeat_customers || !dayStart.repeat_customers.length) {
    throw new Error('mow_offer_accept expected repeat customer after accepting offer');
  }

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

async function runSeedSummary(browser, baseUrl, seed) {
  const page = await openSeededPage(browser, baseUrl, seed);
  await page.keyboard.press('Enter');
  const report = await completeProcessing(page, 1200, true);

  const summary = {
    seed,
    mode: report.mode,
    day: report.day,
    cash: report.cash,
    lead_count: (report.leads || []).length,
    activity: report.last_report?.activity,
    materials: report.last_report?.materials,
    generated_count: (report.last_report?.leads_generated || []).length,
    generated_names: [...(report.last_report?.leads_generated || [])],
  };

  await page.close();
  return summary;
}

async function runSeedMatrix(browser, baseUrl, seeds) {
  const rows = [];
  for (const seed of seeds) {
    const first = await runSeedSummary(browser, baseUrl, seed);
    const second = await runSeedSummary(browser, baseUrl, seed);
    if (JSON.stringify(first) !== JSON.stringify(second)) {
      throw new Error(`Seed matrix determinism check failed for seed=${seed}`);
    }
    rows.push(first);
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv);
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });

  try {
    const scenarios = [
      ['solicit_report', scenarioSolicitReport],
      ['follow_up_report', scenarioFollowUpReport],
      ['mow_offer_accept', scenarioMowOfferAccept],
    ];

    const actual = {};
    if (!args.seedMatrixOnly) {
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
    }

    const seedMatrix = await runSeedMatrix(browser, args.url, args.seeds);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'latest-summary.json'),
      JSON.stringify({
        url: args.url,
        update_golden: args.updateGolden,
        seed_matrix_only: args.seedMatrixOnly,
        scenarios: actual,
        seed_matrix: seedMatrix,
      }, null, 2),
    );

    console.log(JSON.stringify({
      status: 'ok',
      scenarios: Object.keys(actual),
      seeds: args.seeds,
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
