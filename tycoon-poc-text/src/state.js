import { STARTING_CASH } from './constants.js';

export const START_STATE_DEFAULT = 'default';
export const START_STATE_TEST_ALL_ACTIONS = 'test_all_actions';

function createDefaultInitialState() {
  return {
    mode: 'day_action',
    day: 1,
    cash: STARTING_CASH,
    seed: 90210,
    rng: null,
    mowerTierIndex: 0,
    repeatCustomers: [],
    leads: [],
    dayJobs: [],
    selectedJobIds: new Set(),
    planningCursor: 0,
    acceptedJobs: [],
    dayCap: 5,
    scoreInput: 78,
    patternResult: 'none',
    report: null,
    pendingOffers: [],
    selectedOfferIds: new Set(),
    offerCursor: 0,
    actionCursor: 0,
    shopCursor: 0,
    processing: null,
    processingFrame: 0,
    processingToken: 0,
    ticks: 0,
    note: '',
  };
}

function createTestAllActionsInitialState() {
  return {
    mode: 'day_action',
    day: 6,
    cash: 642,
    seed: 90210,
    rng: null,
    mowerTierIndex: 1,
    repeatCustomers: [
      {
        id: 101,
        name: 'C-0101',
        isRepeat: true,
        lawn_size: 'small',
        complexity: 'low',
        pattern_preference: 'stripe',
        base_payout: 56,
        days_since_service: 2,
        distance_cost: 4,
      },
      {
        id: 102,
        name: 'C-0102',
        isRepeat: true,
        lawn_size: 'medium',
        complexity: 'med',
        pattern_preference: 'none',
        base_payout: 84,
        days_since_service: 1,
        distance_cost: 6,
      },
    ],
    leads: [
      {
        id: 201,
        name: 'L-0201',
        isRepeat: false,
        lawn_size: 'medium',
        complexity: 'med',
        pattern_preference: 'circle',
        base_payout: 78,
        days_since_service: 0,
        distance_cost: 5,
        lead_status: 'raw',
      },
      {
        id: 202,
        name: 'L-0202',
        isRepeat: false,
        lawn_size: 'small',
        complexity: 'low',
        pattern_preference: 'stripe',
        base_payout: 60,
        days_since_service: 0,
        distance_cost: 4,
        lead_status: 'qualified',
      },
      {
        id: 203,
        name: 'L-0203',
        isRepeat: false,
        lawn_size: 'large',
        complexity: 'high',
        pattern_preference: 'none',
        base_payout: 124,
        days_since_service: 0,
        distance_cost: 9,
        lead_status: 'qualified',
      },
    ],
    dayJobs: [
      {
        id: 101,
        name: 'C-0101',
        source: 'repeat',
        isRepeat: true,
        lawn_size: 'small',
        complexity: 'low',
        pattern_preference: 'stripe',
        base_payout: 56,
        days_since_service: 2,
        distance_cost: 4,
      },
      {
        id: 102,
        name: 'C-0102',
        source: 'repeat',
        isRepeat: true,
        lawn_size: 'medium',
        complexity: 'med',
        pattern_preference: 'none',
        base_payout: 84,
        days_since_service: 1,
        distance_cost: 6,
      },
      {
        id: 202,
        name: 'L-0202',
        source: 'lead',
        isRepeat: false,
        lawn_size: 'small',
        complexity: 'low',
        pattern_preference: 'stripe',
        base_payout: 60,
        days_since_service: 0,
        distance_cost: 4,
      },
      {
        id: 203,
        name: 'L-0203',
        source: 'lead',
        isRepeat: false,
        lawn_size: 'large',
        complexity: 'high',
        pattern_preference: 'none',
        base_payout: 124,
        days_since_service: 0,
        distance_cost: 9,
      },
    ],
    selectedJobIds: new Set([101, 202]),
    planningCursor: 2,
    acceptedJobs: [
      {
        id: 101,
        name: 'C-0101',
        source: 'repeat',
        complexity: 'low',
        pattern_preference: 'stripe',
        base_payout: 56,
        distance_cost: 4,
      },
      {
        id: 202,
        name: 'L-0202',
        source: 'lead',
        complexity: 'low',
        pattern_preference: 'stripe',
        base_payout: 60,
        distance_cost: 4,
      },
    ],
    dayCap: 5,
    scoreInput: 87,
    patternResult: 'stripe',
    report: {
      day: 5,
      activity: 'mow',
      revenue: 141,
      fuel: 11,
      maintenance: 11,
      materials: 0,
      net: 119,
      endingCash: 642,
      breakdown: [
        {
          name: 'C-0101',
          source: 'repeat',
          finalScore: 93,
          preference: 'stripe',
          delivered: 'stripe',
          payout: 68,
        },
        {
          name: 'L-0202',
          source: 'lead',
          finalScore: 93,
          preference: 'stripe',
          delivered: 'stripe',
          payout: 73,
        },
      ],
      churned: [],
      offers: ['L-0202'],
      retainedCount: 2,
    },
    pendingOffers: [
      {
        id: 204,
        name: 'L-0204',
        isRepeat: true,
        source: 'repeat',
        lawn_size: 'medium',
        complexity: 'med',
        pattern_preference: 'circle',
        base_payout: 88,
        days_since_service: 0,
        distance_cost: 6,
      },
      {
        id: 205,
        name: 'L-0205',
        isRepeat: true,
        source: 'repeat',
        lawn_size: 'small',
        complexity: 'low',
        pattern_preference: 'none',
        base_payout: 57,
        days_since_service: 0,
        distance_cost: 4,
      },
    ],
    selectedOfferIds: new Set([205]),
    offerCursor: 1,
    actionCursor: 2,
    shopCursor: 1,
    processing: null,
    processingFrame: 0,
    processingToken: 0,
    ticks: 3600,
    note: 'Mid-game test snapshot loaded.',
  };
}

export function createInitialState(startStateMode = START_STATE_DEFAULT) {
  if (startStateMode === START_STATE_TEST_ALL_ACTIONS) {
    return createTestAllActionsInitialState();
  }
  return createDefaultInitialState();
}

export function resetCoreState(state, startStateMode = START_STATE_DEFAULT) {
  const seed = state.seed;
  const rng = state.rng;
  const processingToken = state.processingToken + 1;
  const next = createInitialState(startStateMode);

  Object.assign(state, next);
  state.seed = seed;
  state.rng = rng;
  state.processingToken = processingToken;
}
