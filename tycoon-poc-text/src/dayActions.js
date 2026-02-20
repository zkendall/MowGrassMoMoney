import { ACTION_OPTIONS, PASSING_SCORE, PATTERNS } from './constants.js';
import {
  currentTier,
  generateDailyPool,
  jobFinalScore,
  markRetention,
  nextTierOffer,
  patternMultiplier,
  qualityMultiplier,
  randInt,
  randomLead,
} from './jobs.js';
import { logDebug } from './logging.js';

export function createDayActions({ state, render, transitionTo, startProcessing }) {
  function logRoll(message) {
    logDebug(`[day ${state.day}] ${message}`);
  }

  function actionLabel(action) {
    if (action === 'solicit') return 'Solicit';
    if (action === 'follow_up') return 'Follow Up Leads';
    if (action === 'shop_hardware') return 'Shop for New Hardware';
    return 'Mow Lawns';
  }

  function moveDayActionCursor(delta) {
    if (state.mode !== 'day_action') return;
    state.actionCursor = Math.max(0, Math.min(ACTION_OPTIONS.length - 1, state.actionCursor + delta));
    state.note = `Selected action: ${actionLabel(ACTION_OPTIONS[state.actionCursor])}`;
    render();
  }

  function endNonMowDay({ activity, materialsCost = 0, leadsGenerated = [], leadsQualified = [] }) {
    const churned = markRetention(state, new Set());
    const net = -materialsCost;
    state.cash += net;
    state.pendingOffers = [];
    state.selectedOfferIds.clear();
    state.offerCursor = 0;
    state.report = {
      day: state.day,
      activity,
      revenue: 0,
      fuel: 0,
      maintenance: 0,
      materials: materialsCost,
      net,
      endingCash: state.cash,
      breakdown: [],
      churned: churned.map((c) => c.name),
      offers: [],
      retainedCount: state.repeatCustomers.length,
      leads_generated: leadsGenerated,
      leads_qualified: leadsQualified,
    };
    transitionTo(state, 'report');
    render();
  }

  function performSolicitDay() {
    const materialsCost = randInt(state, 5, 15);
    const leadsGenerated = [];
    const solicitRoll = state.rng();
    const solicitSuccess = solicitRoll < 0.45;
    logRoll(`solicit chance roll=${solicitRoll.toFixed(5)} threshold=0.45 result=${solicitSuccess ? 'success' : 'fail'}`);
    if (solicitSuccess) {
      const leadCount = randInt(state, 1, 3);
      logRoll(`solicit lead-count result=${leadCount}`);
      for (let i = 0; i < leadCount; i += 1) {
        const lead = randomLead(state);
        state.leads.push(lead);
        leadsGenerated.push(lead.name);
      }
    }
    state.note = leadsGenerated.length
      ? `Solicited and found ${leadsGenerated.length} new lead(s).`
      : 'Solicited but no new leads today.';
    endNonMowDay({ activity: 'solicit', materialsCost, leadsGenerated });
  }

  function performFollowUpDay() {
    const rawLeads = state.leads.filter((lead) => lead.lead_status === 'raw');
    logRoll(`follow-up start: raw=${rawLeads.length}, qualified=${state.leads.length - rawLeads.length}`);
    if (!rawLeads.length) {
      for (const lead of state.leads) {
        logRoll(`follow-up skip ${lead.name}: status=${lead.lead_status}`);
      }
    }

    const leadsQualified = [];
    for (const lead of state.leads) {
      if (lead.lead_status !== 'raw') continue;
      const qualifyRoll = state.rng();
      const qualifies = qualifyRoll < 0.4;
      logRoll(`follow-up ${lead.name} roll=${qualifyRoll.toFixed(5)} threshold=0.40 result=${qualifies ? 'qualified' : 'not-qualified'}`);
      if (qualifies) {
        lead.lead_status = 'qualified';
        leadsQualified.push(lead.name);
      }
    }
    state.note = leadsQualified.length
      ? `Qualified ${leadsQualified.length} lead(s) for mowing.`
      : 'Follow-ups complete. No new qualified leads today.';
    endNonMowDay({ activity: 'follow_up', leadsQualified });
  }

  function beginMowDay() {
    generateDailyPool(state);
    if (!state.dayJobs.length) {
      state.note = 'No mow jobs available. Solicit or follow up first.';
      render();
      return;
    }
    transitionTo(state, 'planning');
    state.note = 'Choose which available lawns to mow.';
    render();
  }

  function beginHardwareShopDay() {
    transitionTo(state, 'hardware_shop');
    state.shopCursor = 0;
    state.note = 'Choose whether to buy hardware. This activity consumes the day.';
    render();
  }

  function confirmDayAction() {
    if (state.mode !== 'day_action') return;
    const action = ACTION_OPTIONS[state.actionCursor];
    if (action === 'solicit') {
      startProcessing({
        state,
        render,
        transitionTo,
        label: 'Soliciting neighborhood...',
        durationMs: 1200,
        onComplete: performSolicitDay,
      });
      return;
    }
    if (action === 'follow_up') {
      startProcessing({
        state,
        render,
        transitionTo,
        label: 'Following up on leads...',
        durationMs: 1000,
        onComplete: performFollowUpDay,
      });
      return;
    }
    if (action === 'shop_hardware') {
      startProcessing({
        state,
        render,
        transitionTo,
        label: 'Heading to hardware shop...',
        durationMs: 900,
        onComplete: beginHardwareShopDay,
      });
      return;
    }
    beginMowDay();
  }

  function toggleJobSelection(index) {
    if (state.mode !== 'planning') return;
    if (index < 0 || index >= state.dayJobs.length) return;
    const id = state.dayJobs[index].id;

    if (state.selectedJobIds.has(id)) {
      state.selectedJobIds.delete(id);
      state.note = `Removed ${state.dayJobs[index].name}.`;
      render();
      return;
    }

    if (state.selectedJobIds.size >= state.dayCap) {
      state.note = `Job cap reached (${state.dayCap}).`;
      render();
      return;
    }

    state.selectedJobIds.add(id);
    state.note = `Accepted ${state.dayJobs[index].name}.`;
    render();
  }

  function confirmJobs() {
    if (state.mode !== 'planning') return;
    if (!state.selectedJobIds.size) {
      state.note = 'Select at least one job before continuing.';
      render();
      return;
    }

    state.acceptedJobs = state.dayJobs.filter((j) => state.selectedJobIds.has(j.id));
    transitionTo(state, 'performance');
    state.note = 'Set representative score and delivered pattern.';
    render();
  }

  function adjustScore(delta) {
    if (state.mode !== 'performance') return;
    state.scoreInput = Math.max(0, Math.min(100, state.scoreInput + delta));
    state.note = `Representative mow score set to ${state.scoreInput}.`;
    render();
  }

  function setPattern(value) {
    if (state.mode !== 'performance') return;
    if (!PATTERNS.includes(value)) return;
    state.patternResult = value;
    state.note = `Delivered pattern set to ${value}.`;
    render();
  }

  function resolveDayNow() {
    let revenue = 0;
    let fuel = 0;
    const servedRepeatMap = new Set();
    const servicedLeadIds = new Set();
    const offerCandidates = [];
    const breakdown = [];

    for (const job of state.acceptedJobs) {
      const finalScore = jobFinalScore(state, job);
      const mult = qualityMultiplier(finalScore);
      const patternMult = patternMultiplier(state, job);
      const payout = Math.round(job.base_payout * mult * patternMult);
      const jobFuel = currentTier(state).fuelRate + job.distance_cost;

      revenue += payout;
      fuel += jobFuel;
      if (job.source === 'repeat') {
        servedRepeatMap.add(job.id);
      }

      if (job.source === 'lead') {
        servicedLeadIds.add(job.id);
      }

      if (job.source === 'lead' && finalScore >= PASSING_SCORE) {
        offerCandidates.push({ ...job, isRepeat: true, source: 'repeat', days_since_service: 0 });
      }

      breakdown.push({
        name: job.name,
        source: job.source,
        finalScore,
        preference: job.pattern_preference,
        delivered: state.patternResult,
        payout,
      });
    }

    const maintenance = currentTier(state).maintenance;
    const churned = markRetention(state, servedRepeatMap);
    if (servicedLeadIds.size) {
      state.leads = state.leads.filter((lead) => !servicedLeadIds.has(lead.id));
    }
    state.pendingOffers = offerCandidates.filter((c) => !state.repeatCustomers.some((r) => r.id === c.id));
    state.selectedOfferIds.clear();
    state.offerCursor = 0;

    const net = revenue - fuel - maintenance;
    state.cash += net;

    state.report = {
      day: state.day,
      activity: 'mow',
      revenue,
      fuel,
      maintenance,
      net,
      endingCash: state.cash,
      breakdown,
      churned: churned.map((c) => c.name),
      offers: state.pendingOffers.map((c) => c.name),
      retainedCount: state.repeatCustomers.length,
    };

    transitionTo(state, 'report');
    state.note = net >= 0 ? 'Profitable day.' : 'Unprofitable day.';
    render();
  }

  function resolveDay() {
    if (state.mode !== 'performance') return;
    startProcessing({
      state,
      render,
      transitionTo,
      label: 'Processing mowing results...',
      durationMs: 1100,
      onComplete: resolveDayNow,
    });
  }

  function buyUpgrade() {
    const offer = nextTierOffer(state);
    let purchased = null;
    if (offer && state.cash >= offer.upgradeCost) {
      state.cash -= offer.upgradeCost;
      state.mowerTierIndex += 1;
      purchased = offer;
    }
    const churned = markRetention(state, new Set());
    state.pendingOffers = [];
    state.selectedOfferIds.clear();
    state.offerCursor = 0;
    state.report = {
      day: state.day,
      activity: 'shop_hardware',
      revenue: 0,
      fuel: 0,
      maintenance: 0,
      materials: 0,
      hardware_purchase: purchased ? purchased.label : null,
      hardware_cost: purchased ? purchased.upgradeCost : 0,
      net: purchased ? -purchased.upgradeCost : 0,
      endingCash: state.cash,
      breakdown: [],
      churned: churned.map((c) => c.name),
      offers: [],
      retainedCount: state.repeatCustomers.length,
    };
    transitionTo(state, 'report');
    state.note = purchased
      ? `Purchased ${purchased.label} for $${purchased.upgradeCost}.`
      : offer
        ? `Could not afford ${offer.label}.`
        : 'No higher tier available.';
    render();
  }

  function skipHardwareShop() {
    const churned = markRetention(state, new Set());
    state.pendingOffers = [];
    state.selectedOfferIds.clear();
    state.offerCursor = 0;
    state.report = {
      day: state.day,
      activity: 'shop_hardware',
      revenue: 0,
      fuel: 0,
      maintenance: 0,
      materials: 0,
      hardware_purchase: null,
      hardware_cost: 0,
      net: 0,
      endingCash: state.cash,
      breakdown: [],
      churned: churned.map((c) => c.name),
      offers: [],
      retainedCount: state.repeatCustomers.length,
    };
    transitionTo(state, 'report');
    state.note = 'Skipped hardware purchase.';
    render();
  }

  function moveOfferCursor(delta) {
    if (state.mode !== 'report' || !state.pendingOffers.length) return;
    state.offerCursor = Math.max(0, Math.min(state.pendingOffers.length - 1, state.offerCursor + delta));
    render();
  }

  function toggleOfferSelection(index) {
    if (state.mode !== 'report' || !state.pendingOffers.length) return;
    const offer = state.pendingOffers[index];
    if (!offer) return;
    if (state.selectedOfferIds.has(offer.id)) {
      state.selectedOfferIds.delete(offer.id);
      state.note = `Declined ${offer.name} as regular customer.`;
    } else {
      state.selectedOfferIds.add(offer.id);
      state.note = `Accepted ${offer.name} as regular customer.`;
    }
    render();
  }

  function applySelectedOffers() {
    if (!state.pendingOffers.length) return;
    for (const offer of state.pendingOffers) {
      if (!state.selectedOfferIds.has(offer.id)) continue;
      if (state.repeatCustomers.some((r) => r.id === offer.id)) continue;
      state.repeatCustomers.push({
        ...offer,
        isRepeat: true,
        source: 'repeat',
        days_since_service: 0,
      });
    }
  }

  function nextDay() {
    if (state.mode !== 'report') return;
    startProcessing({
      state,
      render,
      transitionTo,
      label: 'Advancing to next day...',
      durationMs: 700,
      requireConfirm: false,
      onComplete: () => {
        applySelectedOffers();
        state.day += 1;
        transitionTo(state, 'day_action');
        state.acceptedJobs = [];
        state.selectedJobIds.clear();
        state.planningCursor = 0;
        state.scoreInput = 78;
        state.patternResult = 'none';
        state.report = null;
        state.pendingOffers = [];
        state.selectedOfferIds.clear();
        state.offerCursor = 0;
        state.actionCursor = 0;
        state.note = `Starting day ${state.day}.`;
        render();
      },
    });
  }

  return {
    moveDayActionCursor,
    confirmDayAction,
    toggleJobSelection,
    confirmJobs,
    adjustScore,
    setPattern,
    resolveDay,
    buyUpgrade,
    skipHardwareShop,
    moveOfferCursor,
    toggleOfferSelection,
    nextDay,
  };
}
