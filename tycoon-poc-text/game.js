(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const consoleEl = document.getElementById('console');
  const activeCustomersEl = document.getElementById('active-customers');

  const TIER_DATA = [
    { id: 'manual_push', label: 'Manual Push', qualityBonus: 0, maintenance: 6, fuelRate: 4, upgradeCost: 0 },
    { id: 'gas_push', label: 'Gas Push', qualityBonus: 6, maintenance: 11, fuelRate: 6, upgradeCost: 320 },
    { id: 'riding_mower', label: 'Riding Mower', qualityBonus: 11, maintenance: 20, fuelRate: 9, upgradeCost: 790 },
  ];

  const COMPLEXITY_PENALTY = {
    low: 0,
    med: 7,
    high: 15,
  };

  const PATTERNS = ['circle', 'stripe', 'none'];
  const PASSING_SCORE = 70;
  const ACTION_OPTIONS = ['solicit', 'follow_up', 'mow', 'shop_hardware'];
  const SPINNER_FRAMES = ['|', '/', '-', '\\'];
  const STARTING_CASH = 220;

  const state = {
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

  function createRng(seed) {
    let s = seed >>> 0;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 1000000) / 1000000;
    };
  }

  function pick(arr) {
    return arr[Math.floor(state.rng() * arr.length)];
  }

  function randInt(min, max) {
    return Math.floor(state.rng() * (max - min + 1)) + min;
  }

  function customerLabel(id) {
    return `C-${String(id).padStart(4, '0')}`;
  }

  function nextCustomerId() {
    const maxExisting = [...state.repeatCustomers, ...state.leads].reduce((m, c) => Math.max(m, c.id), 0);
    return maxExisting + 1;
  }

  function randomCustomer(isRepeat) {
    const id = nextCustomerId();
    const lawnSize = pick(['small', 'medium', 'large']);
    const complexity = pick(['low', 'med', 'high']);
    const patternPreference = pick(PATTERNS);
    const base = lawnSize === 'small' ? randInt(40, 60) : lawnSize === 'medium' ? randInt(60, 92) : randInt(90, 130);

    return {
      id,
      name: customerLabel(id),
      isRepeat,
      lawn_size: lawnSize,
      complexity,
      pattern_preference: patternPreference,
      base_payout: base,
      days_since_service: isRepeat ? randInt(0, 2) : 0,
      distance_cost: randInt(3, 11),
    };
  }

  function randomLead() {
    return { ...randomCustomer(false), lead_status: 'raw' };
  }

  function qualityMultiplier(score) {
    if (score < 40) return 0.5;
    if (score < 70) return 0.9;
    if (score < 90) return 1.0;
    return 1.15;
  }

  function currentTier() {
    return TIER_DATA[state.mowerTierIndex];
  }

  function tierAt(index) {
    return TIER_DATA[Math.max(0, Math.min(TIER_DATA.length - 1, index))];
  }

  function nextTierOffer() {
    if (state.mowerTierIndex >= TIER_DATA.length - 1) return null;
    return tierAt(state.mowerTierIndex + 1);
  }

  function jobFinalScore(job) {
    const score = state.scoreInput + currentTier().qualityBonus - COMPLEXITY_PENALTY[job.complexity];
    return Math.max(0, Math.min(100, score));
  }

  function patternMultiplier(job) {
    const pref = job.pattern_preference;
    const result = state.patternResult;
    if (pref === 'none') return 1;
    if (pref === result) return 1.05;
    return 0.95;
  }

  function generateDailyPool() {
    state.dayJobs = [];
    state.selectedJobIds.clear();
    state.planningCursor = 0;

    // Repeat customers are always in the pool.
    for (const c of state.repeatCustomers) {
      state.dayJobs.push({ ...c, source: 'repeat' });
    }

    // Qualified leads can be scheduled for mowing.
    for (const lead of state.leads) {
      if (lead.lead_status === 'qualified') {
        state.dayJobs.push({ ...lead, source: 'lead' });
      }
    }
  }

  function initialize() {
    state.rng = createRng(state.seed);
    state.repeatCustomers = [];
    state.leads = [];
    state.mode = 'day_action';
    state.day = 1;
    state.cash = STARTING_CASH;
    state.mowerTierIndex = 0;
    state.scoreInput = 78;
    state.patternResult = 'none';
    state.report = null;
    state.pendingOffers = [];
    state.selectedOfferIds.clear();
    state.offerCursor = 0;
    state.actionCursor = 0;
    state.processing = null;
    state.processingFrame = 0;
    state.processingToken += 1;
    state.note = 'Choose how to spend the day.';
    render();
  }

  function startProcessing(label, durationMs, onComplete) {
    state.processingToken += 1;
    const token = state.processingToken;
    state.processing = { label, awaitingConfirm: false, onComplete };
    state.processingFrame = 0;
    state.mode = 'processing';
    render();

    const intervalId = window.setInterval(() => {
      if (state.processingToken !== token) {
        window.clearInterval(intervalId);
        return;
      }
      state.processingFrame = (state.processingFrame + 1) % SPINNER_FRAMES.length;
      render();
    }, 120);

    window.setTimeout(() => {
      if (state.processingToken !== token) return;
      window.clearInterval(intervalId);
      if (!state.processing) return;
      state.processing.awaitingConfirm = true;
      state.note = 'Press Enter to continue.';
      render();
    }, durationMs);
  }

  function planningWarnings() {
    const risky = state.repeatCustomers.filter((c) => c.days_since_service >= 2);
    if (!risky.length) return 'No churn warnings today.';
    return `Churn risk: ${risky.map((c) => c.name).join(', ')}`;
  }

  function actionLabel(action) {
    if (action === 'solicit') return 'Solicit';
    if (action === 'follow_up') return 'Follow Up Leads';
    if (action === 'shop_hardware') return 'Shop for New Hardware';
    return 'Mow Lawns';
  }

  function actionOpportunitySummary(action, qualifiedLeadCount, rawLeadCount) {
    if (action === 'solicit') return '    - 0-3 new leads, $5-$15 materials';
    if (action === 'follow_up') return `    - ${rawLeadCount} leads`;
    if (action === 'mow') {
      return `    - ${qualifiedLeadCount} leads, ${state.repeatCustomers.length} repeat`;
    }
    const offer = nextTierOffer();
    if (!offer) return '    - No upgrade available';
    const affordability = state.cash >= offer.upgradeCost ? 'affordable' : 'too expensive';
    return `    - ${offer.label} $${offer.upgradeCost} (${affordability})`;
  }

  function actionDescriptionSummary(action) {
    if (action === 'solicit') return '    - Spend day canvassing for new leads';
    if (action === 'follow_up') return '    - Spend day qualifying raw leads';
    if (action === 'mow') return '    - Mow qualified leads and repeat customers';
    return '    - Spend day shopping for mower hardware';
  }

  function moveDayActionCursor(delta) {
    if (state.mode !== 'day_action') return;
    state.actionCursor = Math.max(0, Math.min(ACTION_OPTIONS.length - 1, state.actionCursor + delta));
    state.note = `Selected action: ${actionLabel(ACTION_OPTIONS[state.actionCursor])}`;
    render();
  }

  function endNonMowDay({ activity, materialsCost = 0, leadsGenerated = [], leadsQualified = [] }) {
    const churned = markRetention(new Set());
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
    state.mode = 'report';
    render();
  }

  function performSolicitDay() {
    const materialsCost = randInt(5, 15);
    const leadsGenerated = [];
    if (state.rng() < 0.68) {
      const leadCount = randInt(1, 3);
      for (let i = 0; i < leadCount; i += 1) {
        const lead = randomLead();
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
    const leadsQualified = [];
    for (const lead of state.leads) {
      if (lead.lead_status !== 'raw') continue;
      if (state.rng() < 0.4) {
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
    generateDailyPool();
    if (!state.dayJobs.length) {
      state.note = 'No mow jobs available. Solicit or follow up first.';
      render();
      return;
    }
    state.mode = 'planning';
    state.note = 'Choose which available lawns to mow.';
    render();
  }

  function beginHardwareShopDay() {
    state.mode = 'hardware_shop';
    state.shopCursor = 0;
    state.note = 'Choose whether to buy hardware. This activity consumes the day.';
    render();
  }

  function confirmDayAction() {
    if (state.mode !== 'day_action') return;
    const action = ACTION_OPTIONS[state.actionCursor];
    if (action === 'solicit') {
      startProcessing('Soliciting neighborhood...', 1200, performSolicitDay);
      return;
    }
    if (action === 'follow_up') {
      startProcessing('Following up on leads...', 1000, performFollowUpDay);
      return;
    }
    if (action === 'shop_hardware') {
      startProcessing('Heading to hardware shop...', 900, beginHardwareShopDay);
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
    state.mode = 'performance';
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

  function markRetention(servedRepeatMap) {
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

  function resolveDay() {
    if (state.mode !== 'performance') return;
    startProcessing('Processing mowing results...', 1100, resolveDayNow);
  }

  function resolveDayNow() {

    let revenue = 0;
    let fuel = 0;
    const servedRepeatMap = new Set();
    const servicedLeadIds = new Set();
    const offerCandidates = [];
    const breakdown = [];

    for (const job of state.acceptedJobs) {
      const finalScore = jobFinalScore(job);
      const mult = qualityMultiplier(finalScore);
      const patternMult = patternMultiplier(job);
      const payout = Math.round(job.base_payout * mult * patternMult);
      const jobFuel = currentTier().fuelRate + job.distance_cost;

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

    const maintenance = currentTier().maintenance;
    const churned = markRetention(servedRepeatMap);
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

    state.mode = 'report';
    state.note = net >= 0 ? 'Profitable day.' : 'Unprofitable day.';
    render();
  }

  function buyUpgrade() {
    const offer = nextTierOffer();
    let purchased = null;
    if (offer && state.cash >= offer.upgradeCost) {
      state.cash -= offer.upgradeCost;
      state.mowerTierIndex += 1;
      purchased = offer;
    }
    const churned = markRetention(new Set());
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
    state.mode = 'report';
    state.note = purchased
      ? `Purchased ${purchased.label} for $${purchased.upgradeCost}.`
      : offer
        ? `Could not afford ${offer.label}.`
        : 'No higher tier available.';
    render();
  }

  function skipHardwareShop() {
    const churned = markRetention(new Set());
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
    state.mode = 'report';
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
    startProcessing('Advancing to next day...', 700, () => {
      applySelectedOffers();
      state.day += 1;
      state.mode = 'day_action';
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
    });
  }

  function renderConsole() {
    const lines = [];
    const tier = currentTier();
    const qualifiedLeadCount = state.leads.filter((l) => l.lead_status === 'qualified').length;
    const rawLeadCount = state.leads.length - qualifiedLeadCount;

    lines.push(`DAY ${state.day} | CASH $${state.cash} | MOWER ${tier.label}`);
    lines.push(`REPEAT CUSTOMERS: ${state.repeatCustomers.length} | DAY CAP: ${state.dayCap}`);
    lines.push(`LEADS: ${state.leads.length} total (${qualifiedLeadCount} qualified, ${rawLeadCount} raw)`);
    lines.push(planningWarnings());
    lines.push('');

    if (state.mode === 'day_action') {
      lines.push('PHASE: DAY ACTION SELECTION (Up/Down move, Enter confirm)');
      for (let i = 0; i < ACTION_OPTIONS.length; i += 1) {
        const cursor = i === state.actionCursor ? '>' : ' ';
        const action = ACTION_OPTIONS[i];
        lines.push(`${cursor} ${actionLabel(action)}`);
        lines.push(actionDescriptionSummary(action));
        lines.push(actionOpportunitySummary(action, qualifiedLeadCount, rawLeadCount));
      }
    }

    if (state.mode === 'hardware_shop') {
      const offer = nextTierOffer();
      lines.push('PHASE: HARDWARE SHOP (Up/Down move, Enter confirm)');
      if (!offer) {
        lines.push('No higher tier available.');
        lines.push('> Continue without purchase');
      } else {
        const canAfford = state.cash >= offer.upgradeCost;
        const options = [
          `Buy ${offer.label} for $${offer.upgradeCost}${canAfford ? '' : ' (cannot afford)'}`,
          'Skip purchase',
        ];
        for (let i = 0; i < options.length; i += 1) {
          const cursor = i === state.shopCursor ? '>' : ' ';
          lines.push(`${cursor} ${options[i]}`);
        }
      }
    }

    if (state.mode === 'processing' && state.processing) {
      const frame = SPINNER_FRAMES[state.processingFrame];
      lines.push(`PHASE: PROCESSING ${frame}`);
      lines.push(state.processing.label);
      lines.push(state.processing.awaitingConfirm ? 'Press Enter to continue.' : 'Please wait...');
    }

    if (state.mode === 'planning') {
      lines.push('PHASE: PLAN JOBS (Up/Down move, Space toggle, Enter confirm)');
      lines.push('IDX  TYPE   NAME    SIZE    CX   PREF    BASE  DUE');
      state.dayJobs.forEach((job, idx) => {
        const cursor = idx === state.planningCursor ? '>' : ' ';
        const marker = state.selectedJobIds.has(job.id) ? '[x]' : '[ ]';
        const due = job.source === 'repeat' ? `${job.days_since_service}d` : 'lead';
        lines.push(`${cursor}${marker} ${idx + 1}. ${job.source.padEnd(6)} ${job.name.padEnd(7)} ${job.lawn_size.padEnd(6)} ${job.complexity.padEnd(4)} ${job.pattern_preference.padEnd(7)} $${String(job.base_payout).padEnd(4)} ${due}`);
      });
      lines.push('');
      lines.push(`Selected: ${state.selectedJobIds.size}/${state.dayCap}`);
    }

    if (state.mode === 'performance') {
      lines.push('PHASE: SET REPRESENTATIVE RESULT (Enter to resolve)');
      lines.push(`Accepted jobs: ${state.acceptedJobs.length}`);
      lines.push(`Representative mow score: ${state.scoreInput}`);
      lines.push(`Delivered pattern: ${state.patternResult}`);
      lines.push('Pattern keys: Left/Right cycle pattern');
      lines.push('Score keys: Up/Down');
    }

    if (state.mode === 'report' && state.report) {
      lines.push('PHASE: END OF DAY REPORT (Enter for next day)');
      lines.push(`Activity: ${state.report.activity || 'mow'}`);
      lines.push(`Revenue: $${state.report.revenue}`);
      lines.push(`Costs: Fuel $${state.report.fuel} + Maintenance $${state.report.maintenance} + Materials $${state.report.materials || 0}`);
      lines.push(`Net: $${state.report.net}`);
      lines.push(`Cash: $${state.report.endingCash}`);
      lines.push(`Customers retained: ${state.report.retainedCount}`);
      lines.push(`Regular offers: ${state.report.offers.length ? state.report.offers.join(', ') : 'none'}`);
      lines.push(`Churned: ${state.report.churned.length ? state.report.churned.join(', ') : 'none'}`);
      if (state.report.hardware_purchase !== undefined) {
        lines.push(`Hardware purchased: ${state.report.hardware_purchase || 'none'}`);
        lines.push(`Hardware cost: $${state.report.hardware_cost || 0}`);
      }
      if (state.report.leads_generated) {
        lines.push(`Leads generated: ${state.report.leads_generated.length ? state.report.leads_generated.join(', ') : 'none'}`);
      }
      if (state.report.leads_qualified) {
        lines.push(`Leads qualified: ${state.report.leads_qualified.length ? state.report.leads_qualified.join(', ') : 'none'}`);
      }
      lines.push('');
      if (state.report.breakdown.length) {
        lines.push('JOB BREAKDOWN');
        for (const b of state.report.breakdown) {
          lines.push(`${b.name} (${b.source}) | score ${b.finalScore} | pref ${b.preference} vs ${b.delivered} | payout $${b.payout}`);
        }
      } else {
        lines.push('JOB BREAKDOWN: none (non-mowing day).');
      }
      lines.push('');
      if (state.pendingOffers.length) {
        lines.push('REGULAR CUSTOMER OFFERS (Up/Down move, Space toggle, Enter confirm)');
        for (let i = 0; i < state.pendingOffers.length; i += 1) {
          const pending = state.pendingOffers[i];
          const cursor = i === state.offerCursor ? '>' : ' ';
          const marker = state.selectedOfferIds.has(pending.id) ? '[x]' : '[ ]';
          lines.push(`${cursor}${marker} ${pending.name} | pref ${pending.pattern_preference} | base $${pending.base_payout}`);
        }
      } else {
        lines.push('REGULAR CUSTOMER OFFERS: none this day.');
      }
    }

    lines.push('');
    lines.push(`NOTE: ${state.note}`);
    consoleEl.innerHTML = formatConsoleHtml(lines.join('\n'));
  }

  function escapeHtml(text) {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function formatConsoleHtml(rawText) {
    let html = escapeHtml(rawText);
    html = html.replace(/\[x\]/g, '<span class="con-ok">[x]</span>');
    html = html.replace(/\[ \]/g, '<span class="con-muted">[ ]</span>');
    html = html.replace(/^PHASE:.*$/gm, '<span class="con-phase">$&</span>');
    html = html.replace(/^NOTE:.*$/gm, '<span class="con-note">$&</span>');
    html = html.replace(/^Churn risk:.*$/gm, '<span class="con-warn">$&</span>');
    html = html.replace(/^Net: \$-?\d+.*$/gm, (line) => {
      const isNegative = /-\d+/.test(line);
      return `<span class="${isNegative ? 'con-neg' : 'con-pos'}">${line}</span>`;
    });
    html = html.replace(/^Cash: \$\d+.*$/gm, '<span class="con-cash">$&</span>');
    html = html.replace(/^Regular offers:.*$/gm, '<span class="con-offer">$&</span>');
    html = html.replace(/^JOB BREAKDOWN.*$/gm, '<span class="con-phase">$&</span>');
    return html;
  }

  function renderActiveCustomers() {
    activeCustomersEl.textContent = '';
    if (!state.repeatCustomers.length) {
      const li = document.createElement('li');
      li.textContent = 'No active customers yet.';
      activeCustomersEl.appendChild(li);
      return;
    }

    const sorted = [...state.repeatCustomers].sort((a, b) => a.days_since_service - b.days_since_service);
    for (const customer of sorted) {
      const li = document.createElement('li');
      const riskTag = customer.days_since_service >= 2 ? ' [risk]' : '';
      li.textContent = `${customer.name} | pref: ${customer.pattern_preference} | last service: ${customer.days_since_service}d${riskTag}`;
      activeCustomersEl.appendChild(li);
    }
  }

  function drawStatusCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = 220;
    const targetWidth = Math.floor(width * dpr);
    const targetHeight = Math.floor(height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#223125';
    ctx.font = 'bold 20px Courier New';
    ctx.fillText('Tycoon Meta Loop Status', 14, 28);

    ctx.font = '17px Courier New';
    ctx.fillStyle = '#304936';
    ctx.fillText(`Day ${state.day}`, 14, 56);
    ctx.fillText(`Cash $${state.cash}`, 14, 80);
    ctx.fillText(`Mower ${currentTier().label}`, 14, 104);

    const gaugeX = 14;
    const gaugeY = 124;
    const gaugeW = width - 28;
    const gaugeH = 20;
    const cashNorm = Math.max(0, Math.min(1, state.cash / 1800));

    ctx.fillStyle = '#95ad90';
    ctx.fillRect(gaugeX, gaugeY, gaugeW, gaugeH);
    ctx.fillStyle = '#537447';
    ctx.fillRect(gaugeX, gaugeY, Math.round(gaugeW * cashNorm), gaugeH);
    ctx.strokeStyle = '#2d4833';
    ctx.strokeRect(gaugeX, gaugeY, gaugeW, gaugeH);
    ctx.fillStyle = '#1f3325';
    ctx.fillText('Cash Progress', gaugeX, gaugeY - 8);

    const customerGaugeY = 176;
    const custNorm = Math.max(0, Math.min(1, state.repeatCustomers.length / 12));
    ctx.fillStyle = '#95ad90';
    ctx.fillRect(gaugeX, customerGaugeY, gaugeW, gaugeH);
    ctx.fillStyle = '#6b8f5b';
    ctx.fillRect(gaugeX, customerGaugeY, Math.round(gaugeW * custNorm), gaugeH);
    ctx.strokeStyle = '#2d4833';
    ctx.strokeRect(gaugeX, customerGaugeY, gaugeW, gaugeH);
    ctx.fillStyle = '#1f3325';
    ctx.fillText('Repeat Customer Count', gaugeX, customerGaugeY - 8);
  }

  function render() {
    drawStatusCanvas();
    renderConsole();
    renderActiveCustomers();
  }

  function toTextState() {
    const payload = {
      coordinate_system: 'UI state only; no world coordinates. origin not applicable.',
      mode: state.mode,
      day: state.day,
      cash: state.cash,
      mower_tier: currentTier().id,
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
    };

    return JSON.stringify(payload);
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

  document.addEventListener('keydown', (event) => {
    if (event.key === 'f' || event.key === 'F') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
      return;
    }

    if (event.key === 'r' || event.key === 'R') {
      initialize();
      return;
    }

    if (state.mode === 'processing') {
      if (event.key === 'Enter' && state.processing?.awaitingConfirm) {
        event.preventDefault();
        const callback = state.processing.onComplete;
        state.processingToken += 1;
        state.processing = null;
        if (typeof callback === 'function') callback();
      }
      return;
    }

    if (state.mode === 'day_action') {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveDayActionCursor(-1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveDayActionCursor(1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmDayAction();
        return;
      }
    }

    if (state.mode === 'hardware_shop') {
      const offer = nextTierOffer();
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.shopCursor = Math.max(0, state.shopCursor - 1);
        render();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.shopCursor = Math.min(1, state.shopCursor + 1);
        render();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!offer) {
          startProcessing('Wrapping up hardware visit...', 650, skipHardwareShop);
          return;
        }
        if (state.shopCursor === 0) {
          startProcessing('Completing hardware purchase...', 850, buyUpgrade);
        } else {
          startProcessing('Leaving hardware shop...', 650, skipHardwareShop);
        }
        return;
      }
    }

    if (state.mode === 'planning') {
      if (!state.dayJobs.length) return;
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        state.planningCursor = Math.max(0, state.planningCursor - 1);
        state.note = `Cursor on job ${state.planningCursor + 1}.`;
        render();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        state.planningCursor = Math.min(state.dayJobs.length - 1, state.planningCursor + 1);
        state.note = `Cursor on job ${state.planningCursor + 1}.`;
        render();
        return;
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        toggleJobSelection(state.planningCursor);
        return;
      }
      if (event.key >= '1' && event.key <= '9') {
        event.preventDefault();
        toggleJobSelection(Number(event.key) - 1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmJobs();
        return;
      }
    }

    if (state.mode === 'performance') {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        adjustScore(1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        adjustScore(-1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const idx = PATTERNS.indexOf(state.patternResult);
        setPattern(PATTERNS[(idx + PATTERNS.length - 1) % PATTERNS.length]);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const idx = PATTERNS.indexOf(state.patternResult);
        setPattern(PATTERNS[(idx + 1) % PATTERNS.length]);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        resolveDay();
        return;
      }
    }

    if (state.mode === 'report') {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveOfferCursor(-1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveOfferCursor(1);
        return;
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        toggleOfferSelection(state.offerCursor);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        nextDay();
      }
    }
  });

  window.addEventListener('resize', () => {
    render();
  });

  initialize();
})();
