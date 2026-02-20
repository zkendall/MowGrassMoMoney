import { COMPLEXITY_PENALTY, PATTERNS, TIER_DATA } from './constants.js';
import { logDebug } from './logging.js';

export function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000000) / 1000000;
  };
}

function pick(state, arr) {
  const roll = state.rng();
  const idx = Math.floor(roll * arr.length);
  const value = arr[idx];
  logDebug(`pick [${arr.join(',')}]: roll=${roll.toFixed(5)} idx=${idx} => ${value}`);
  return value;
}

export function randInt(state, min, max) {
  const roll = state.rng();
  const value = Math.floor(roll * (max - min + 1)) + min;
  logDebug(`randInt ${min}-${max}: roll=${roll.toFixed(5)} => ${value}`);
  return value;
}

function customerLabel(id) {
  return `C-${String(id).padStart(4, '0')}`;
}

export function nextCustomerId(state) {
  const maxExisting = [...state.repeatCustomers, ...state.leads].reduce((m, c) => Math.max(m, c.id), 0);
  return maxExisting + 1;
}

export function randomCustomer(state, isRepeat) {
  const id = nextCustomerId(state);
  const lawnSize = pick(state, ['small', 'medium', 'large']);
  const complexity = pick(state, ['low', 'med', 'high']);
  const patternPreference = pick(state, PATTERNS);
  const base = lawnSize === 'small'
    ? randInt(state, 40, 60)
    : lawnSize === 'medium'
      ? randInt(state, 60, 92)
      : randInt(state, 90, 130);

  return {
    id,
    name: customerLabel(id),
    isRepeat,
    lawn_size: lawnSize,
    complexity,
    pattern_preference: patternPreference,
    base_payout: base,
    days_since_service: isRepeat ? randInt(state, 0, 2) : 0,
    distance_cost: randInt(state, 3, 11),
  };
}

export function randomLead(state) {
  return { ...randomCustomer(state, false), lead_status: 'raw' };
}

export function qualityMultiplier(score) {
  if (score < 40) return 0.5;
  if (score < 70) return 0.9;
  if (score < 90) return 1.0;
  return 1.15;
}

export function currentTier(state) {
  return TIER_DATA[state.mowerTierIndex];
}

function tierAt(index) {
  return TIER_DATA[Math.max(0, Math.min(TIER_DATA.length - 1, index))];
}

export function nextTierOffer(state) {
  if (state.mowerTierIndex >= TIER_DATA.length - 1) return null;
  return tierAt(state.mowerTierIndex + 1);
}

export function jobFinalScore(state, job) {
  const score = state.scoreInput + currentTier(state).qualityBonus - COMPLEXITY_PENALTY[job.complexity];
  return Math.max(0, Math.min(100, score));
}

export function patternMultiplier(state, job) {
  const pref = job.pattern_preference;
  const result = state.patternResult;
  if (pref === 'none') return 1;
  if (pref === result) return 1.05;
  return 0.95;
}

export function generateDailyPool(state) {
  state.dayJobs = [];
  state.selectedJobIds.clear();
  state.planningCursor = 0;

  for (const customer of state.repeatCustomers) {
    state.dayJobs.push({ ...customer, source: 'repeat' });
  }

  for (const lead of state.leads) {
    if (lead.lead_status === 'qualified') {
      state.dayJobs.push({ ...lead, source: 'lead' });
    }
  }
}

export function planningWarnings(state) {
  const risky = state.repeatCustomers.filter((c) => c.days_since_service >= 2);
  if (!risky.length) return 'No churn warnings today.';
  return `Churn risk: ${risky.map((c) => c.name).join(', ')}`;
}

export function markRetention(state, servedRepeatMap) {
  const retained = [];
  const churned = [];

  for (const customer of state.repeatCustomers) {
    if (servedRepeatMap.has(customer.id)) {
      customer.days_since_service = 0;
    } else {
      customer.days_since_service += 1;
    }

    if (customer.days_since_service > 3) {
      churned.push(customer);
    } else {
      retained.push(customer);
    }
  }

  state.repeatCustomers = retained;
  return churned;
}
