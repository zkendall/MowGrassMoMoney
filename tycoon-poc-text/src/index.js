import { ACTION_OPTIONS } from './constants.js';
import { createDayActions } from './dayActions.js';
import { createRng, currentTier } from './jobs.js';
import { attachKeyboard } from './keyboard.js';
import { logDebug, logInfo } from './logging.js';
import { startProcessing } from './processing.js';
import { renderActiveCustomersView } from './render/activeCustomersView.js';
import { renderConsoleView } from './render/consoleView.js';
import { drawStatusPanel } from './render/statusPanel.js';
import { createInitialState, resetCoreState } from './state.js';
import { forceMode, transitionTo } from './stateMachine.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const consoleEl = document.getElementById('console');
const activeCustomersEl = document.getElementById('active-customers');

const state = createInitialState();
const QUERY_SEED_PARAM = 'seed';

function parseSeedOverride() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(QUERY_SEED_PARAM);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed >>> 0;
}

function render() {
  drawStatusPanel(state, canvas, ctx);
  renderConsoleView(state, consoleEl);
  renderActiveCustomersView(state, activeCustomersEl);
}

function initialize() {
  const querySeed = parseSeedOverride();
  if (querySeed !== null) {
    state.seed = querySeed;
  }
  state.rng = createRng(state.seed);
  resetCoreState(state);
  forceMode(state, 'day_action');
  state.note = 'Choose how to spend the day.';
  logInfo(`app initialized (seed=${state.seed}, log_level active)`);
  render();
}

const actions = createDayActions({
  state,
  render,
  transitionTo,
  startProcessing,
});

function toTextState() {
  const payload = {
    coordinate_system: 'UI state only; no world coordinates. origin not applicable.',
    mode: state.mode,
    day: state.day,
    seed: state.seed,
    cash: state.cash,
    mower_tier: currentTier(state).id,
    repeat_customers: state.repeatCustomers.map((c) => ({
      id: c.id,
      days_since_service: c.days_since_service,
      pattern_preference: c.pattern_preference,
    })),
    leads: state.leads.map((l) => ({
      id: l.id,
      name: l.name,
      lead_status: l.lead_status,
      pattern_preference: l.pattern_preference,
    })),
    accepted_jobs: state.acceptedJobs.map((j) => ({
      id: j.id,
      source: j.source,
      complexity: j.complexity,
      pattern_preference: j.pattern_preference,
    })),
    planning_jobs: state.dayJobs.map((j, idx) => ({
      index: idx + 1,
      id: j.id,
      selected: state.selectedJobIds.has(j.id),
      source: j.source,
    })),
    representative_input: {
      mow_score: state.scoreInput,
      pattern_result: state.patternResult,
    },
    day_action: {
      cursor: state.actionCursor,
      selected: ACTION_OPTIONS[state.actionCursor],
    },
    last_report: state.report,
    controls: {
      day_action: 'Up/Down choose, Enter confirm',
      hardware_shop: 'Up/Down choose buy/skip, Enter confirm',
      planning: 'Up/Down move, Space toggle, Enter confirm',
      performance: 'Up/Down score, Left/Right pattern, Enter resolve',
      report: 'Up/Down move offer, Space accept/decline, Enter next day',
    },
    pending_regular_offers: state.pendingOffers.map((c) => ({
      id: c.id,
      name: c.name,
      selected: state.selectedOfferIds.has(c.id),
    })),
    debug_log_tail: Array.isArray(window.__tycoonLogs) ? window.__tycoonLogs.slice(-25) : [],
  };

  return JSON.stringify(payload, null, 2);
}

function step(ms) {
  const frames = Math.max(1, Math.round(ms / (1000 / 60)));
  state.ticks += frames;
}

window.render_game_to_text = toTextState;
window.advanceTime = (ms) => {
  step(ms);
  render();
};
window.tycoonLogTest = () => {
  logInfo('manual log test (INFO)');
  logDebug('manual log test (DEBUG)');
  return Array.isArray(window.__tycoonLogs) ? window.__tycoonLogs.slice(-5) : [];
};
window.__tycoonTestSetLeads = ({ count = 1, status = 'qualified' } = {}) => {
  const normalizedCount = Math.max(0, Number.parseInt(count, 10) || 0);
  const normalizedStatus = status === 'raw' ? 'raw' : 'qualified';
  state.leads = [];
  for (let i = 0; i < normalizedCount; i += 1) {
    state.leads.push({
      id: 9000 + i,
      name: `T-${String(i + 1).padStart(2, '0')}`,
      isRepeat: false,
      lawn_size: 'small',
      complexity: 'low',
      pattern_preference: 'none',
      base_payout: 65,
      days_since_service: 0,
      distance_cost: 3,
      lead_status: normalizedStatus,
    });
  }
  render();
  return state.leads.length;
};
window.setTycoonSeed = (nextSeed) => {
  const parsed = Number.parseInt(nextSeed, 10);
  if (!Number.isFinite(parsed)) return false;
  state.seed = parsed >>> 0;
  initialize();
  return true;
};

attachKeyboard({
  state,
  render,
  initialize,
  startProcessing,
  transitionTo,
  actions,
});

window.addEventListener('resize', () => {
  render();
});

initialize();
