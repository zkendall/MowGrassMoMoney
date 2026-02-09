(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const consoleEl = document.getElementById('console');

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

  const state = {
    mode: 'planning',
    day: 1,
    cash: 400,
    seed: 90210,
    rng: null,
    mowerTierIndex: 0,
    repeatCustomers: [],
    prospects: [],
    dayJobs: [],
    selectedJobIds: new Set(),
    planningCursor: 0,
    acceptedJobs: [],
    dayCap: 5,
    scoreInput: 78,
    patternResult: 'none',
    report: null,
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
    const maxExisting = [...state.repeatCustomers, ...state.prospects].reduce((m, c) => Math.max(m, c.id), 0);
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

    // Prospects are re-rolled each day in a small range.
    state.prospects = [];
    const prospectCount = randInt(2, 4);
    for (let i = 0; i < prospectCount; i += 1) {
      const p = randomCustomer(false);
      state.prospects.push(p);
      state.dayJobs.push({ ...p, source: 'new' });
    }
  }

  function initialize() {
    state.rng = createRng(state.seed);
    state.repeatCustomers = [];
    for (let i = 0; i < 3; i += 1) {
      state.repeatCustomers.push(randomCustomer(true));
    }
    state.mode = 'planning';
    state.day = 1;
    state.cash = 400;
    state.mowerTierIndex = 0;
    state.scoreInput = 78;
    state.patternResult = 'none';
    state.report = null;
    state.note = 'Text-first tycoon prototype ready.';
    generateDailyPool();
    render();
  }

  function planningWarnings() {
    const risky = state.repeatCustomers.filter((c) => c.days_since_service >= 2);
    if (!risky.length) return 'No churn warnings today.';
    return `Churn risk: ${risky.map((c) => c.name).join(', ')}`;
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

    let revenue = 0;
    let fuel = 0;
    const servedRepeatMap = new Set();
    const converted = [];
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

      if (job.source === 'new' && finalScore >= 80 && state.rng() < 0.7) {
        converted.push({ ...job, isRepeat: true, source: 'repeat', days_since_service: 0 });
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

    for (const c of converted) {
      if (!state.repeatCustomers.some((r) => r.id === c.id)) {
        state.repeatCustomers.push(c);
      }
    }

    const net = revenue - fuel - maintenance;
    state.cash += net;

    state.report = {
      day: state.day,
      revenue,
      fuel,
      maintenance,
      net,
      endingCash: state.cash,
      breakdown,
      churned: churned.map((c) => c.name),
      converted: converted.map((c) => c.name),
      retainedCount: state.repeatCustomers.length,
    };

    state.mode = 'report';
    state.note = net >= 0 ? 'Profitable day.' : 'Unprofitable day.';
    render();
  }

  function buyUpgrade() {
    if (state.mode !== 'report') return;
    const offer = nextTierOffer();
    if (!offer) {
      state.note = 'No higher tier available.';
      render();
      return;
    }
    if (state.cash < offer.upgradeCost) {
      state.note = `Not enough cash for ${offer.label}.`;
      render();
      return;
    }

    state.cash -= offer.upgradeCost;
    state.mowerTierIndex += 1;
    if (state.report) state.report.endingCash = state.cash;
    state.note = `Purchased ${offer.label} for $${offer.upgradeCost}.`;
    render();
  }

  function nextDay() {
    if (state.mode !== 'report') return;
    state.day += 1;
    state.mode = 'planning';
    state.acceptedJobs = [];
    state.selectedJobIds.clear();
    state.planningCursor = 0;
    state.scoreInput = 78;
    state.patternResult = 'none';
    state.report = null;
    state.note = `Starting day ${state.day}.`;
    generateDailyPool();
    render();
  }

  function renderConsole() {
    const lines = [];
    const tier = currentTier();

    lines.push(`DAY ${state.day} | CASH $${state.cash} | MOWER ${tier.label}`);
    lines.push(`REPEAT CUSTOMERS: ${state.repeatCustomers.length} | DAY CAP: ${state.dayCap}`);
    lines.push(planningWarnings());
    lines.push('');

    if (state.mode === 'planning') {
      lines.push('PHASE: PLAN JOBS (Up/Down move, Space toggle, Enter confirm)');
      lines.push('IDX  TYPE   NAME    SIZE    CX   PREF    BASE  DUE');
      state.dayJobs.forEach((job, idx) => {
        const cursor = idx === state.planningCursor ? '>' : ' ';
        const marker = state.selectedJobIds.has(job.id) ? '[x]' : '[ ]';
        const due = job.source === 'repeat' ? `${job.days_since_service}d` : '--';
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
      const offer = nextTierOffer();
      lines.push('PHASE: END OF DAY REPORT (Enter for next day)');
      lines.push(`Revenue: $${state.report.revenue}`);
      lines.push(`Costs: Fuel $${state.report.fuel} + Maintenance $${state.report.maintenance}`);
      lines.push(`Net: $${state.report.net}`);
      lines.push(`Cash: $${state.report.endingCash}`);
      lines.push(`Customers retained: ${state.report.retainedCount}`);
      lines.push(`Converted: ${state.report.converted.length ? state.report.converted.join(', ') : 'none'}`);
      lines.push(`Churned: ${state.report.churned.length ? state.report.churned.join(', ') : 'none'}`);
      lines.push('');
      lines.push('JOB BREAKDOWN');
      for (const b of state.report.breakdown) {
        lines.push(`${b.name} (${b.source}) | score ${b.finalScore} | pref ${b.preference} vs ${b.delivered} | payout $${b.payout}`);
      }
      lines.push('');
      if (offer) {
        lines.push(`Upgrade offer: ${offer.label} for $${offer.upgradeCost} (press U to buy)`);
      } else {
        lines.push('Upgrade offer: none (max tier reached)');
      }
    }

    lines.push('');
    lines.push(`NOTE: ${state.note}`);
    consoleEl.textContent = lines.join('\n');
  }

  function drawStatusCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#223125';
    ctx.font = 'bold 26px Courier New';
    ctx.fillText('Tycoon Meta Loop Status', 16, 34);

    ctx.font = '18px Courier New';
    ctx.fillStyle = '#304936';
    ctx.fillText(`Day ${state.day}`, 16, 66);
    ctx.fillText(`Cash $${state.cash}`, 16, 92);
    ctx.fillText(`Mower ${currentTier().label}`, 16, 118);

    const gaugeX = 360;
    const gaugeY = 52;
    const gaugeW = 560;
    const gaugeH = 24;
    const cashNorm = Math.max(0, Math.min(1, state.cash / 1800));

    ctx.fillStyle = '#95ad90';
    ctx.fillRect(gaugeX, gaugeY, gaugeW, gaugeH);
    ctx.fillStyle = '#537447';
    ctx.fillRect(gaugeX, gaugeY, Math.round(gaugeW * cashNorm), gaugeH);
    ctx.strokeStyle = '#2d4833';
    ctx.strokeRect(gaugeX, gaugeY, gaugeW, gaugeH);
    ctx.fillStyle = '#1f3325';
    ctx.fillText('Cash Progress', gaugeX, gaugeY - 8);

    const customerGaugeY = 108;
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
      last_report: state.report,
      controls: {
        planning: 'Up/Down move, Space toggle, Enter confirm',
        performance: 'Up/Down score, Left/Right pattern, Enter resolve',
        report: 'A buy upgrade, Enter next day',
      },
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

    if (state.mode === 'planning') {
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
      if (event.key === 'u' || event.key === 'U' || event.key === 'a' || event.key === 'A') {
        event.preventDefault();
        buyUpgrade();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        nextDay();
      }
    }
  });

  initialize();
})();
