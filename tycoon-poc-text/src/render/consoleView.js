import { ACTION_OPTIONS, SPINNER_FRAMES } from '../constants.js';
import { currentTier, nextTierOffer, planningWarnings } from '../jobs.js';

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

function actionLabel(action) {
  if (action === 'solicit') return 'Solicit';
  if (action === 'follow_up') return 'Follow Up Leads';
  if (action === 'shop_hardware') return 'Shop for New Hardware';
  return 'Mow Lawns';
}

function actionDescriptionSummary(action) {
  if (action === 'solicit') return '    - Spend day canvassing for new leads';
  if (action === 'follow_up') return '    - Spend day qualifying raw leads';
  if (action === 'mow') return '    - Mow qualified leads and repeat customers';
  return '    - Spend day shopping for mower hardware';
}

function actionOpportunitySummary(state, action, qualifiedLeadCount, rawLeadCount) {
  if (action === 'solicit') return '    - 0-3 new leads, $5-$15 materials';
  if (action === 'follow_up') return `    - ${rawLeadCount} raw leads`;
  if (action === 'mow') {
    return `    - ${qualifiedLeadCount} qualified leads, ${state.repeatCustomers.length} repeat`;
  }
  const offer = nextTierOffer(state);
  if (!offer) return '    - No upgrade available';
  const affordability = state.cash >= offer.upgradeCost ? 'affordable' : 'too expensive';
  return `    - ${offer.label} $${offer.upgradeCost} (${affordability})`;
}

export function renderConsoleView(state, consoleEl) {
  const lines = [];
  const tier = currentTier(state);
  const qualifiedLeadCount = state.leads.filter((l) => l.lead_status === 'qualified').length;
  const rawLeadCount = state.leads.length - qualifiedLeadCount;

  lines.push(`DAY ${state.day} | CASH $${state.cash} | MOWER ${tier.label}`);
  lines.push(`REPEAT CUSTOMERS: ${state.repeatCustomers.length} | DAY CAP: ${state.dayCap}`);
  lines.push(`LEADS: ${state.leads.length} total (${qualifiedLeadCount} qualified, ${rawLeadCount} raw)`);
  lines.push(planningWarnings(state));
  lines.push('');

  if (state.mode === 'day_action') {
    lines.push('PHASE: DAY ACTION SELECTION (Up/Down move, Enter confirm)');
    for (let i = 0; i < ACTION_OPTIONS.length; i += 1) {
      const cursor = i === state.actionCursor ? '>' : ' ';
      const action = ACTION_OPTIONS[i];
      lines.push(`${cursor} ${actionLabel(action)}`);
      lines.push(actionDescriptionSummary(action));
      lines.push(actionOpportunitySummary(state, action, qualifiedLeadCount, rawLeadCount));
    }
  }

  if (state.mode === 'hardware_shop') {
    const offer = nextTierOffer(state);
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
    lines.push(state.processing.awaitingConfirm ? 'Press Enter to continue.' : 'Please wait... (Enter to skip)');
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
