import { PATTERNS } from './constants.js';
import { nextTierOffer } from './jobs.js';

export function attachKeyboard({ state, render, initialize, startProcessing, transitionTo, actions }) {
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
        actions.moveDayActionCursor(-1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        actions.moveDayActionCursor(1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        actions.confirmDayAction();
        return;
      }
    }

    if (state.mode === 'hardware_shop') {
      const offer = nextTierOffer(state);
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
          startProcessing({
            state,
            render,
            transitionTo,
            label: 'Wrapping up hardware visit...',
            durationMs: 650,
            onComplete: actions.skipHardwareShop,
          });
          return;
        }
        if (state.shopCursor === 0) {
          startProcessing({
            state,
            render,
            transitionTo,
            label: 'Completing hardware purchase...',
            durationMs: 850,
            onComplete: actions.buyUpgrade,
          });
        } else {
          startProcessing({
            state,
            render,
            transitionTo,
            label: 'Leaving hardware shop...',
            durationMs: 650,
            onComplete: actions.skipHardwareShop,
          });
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
      if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space' || event.code === 'Space') {
        event.preventDefault();
        actions.toggleJobSelection(state.planningCursor);
        return;
      }
      if (event.key >= '1' && event.key <= '9') {
        event.preventDefault();
        actions.toggleJobSelection(Number(event.key) - 1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        actions.confirmJobs();
        return;
      }
    }

    if (state.mode === 'performance') {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        actions.adjustScore(1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        actions.adjustScore(-1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const idx = PATTERNS.indexOf(state.patternResult);
        actions.setPattern(PATTERNS[(idx + PATTERNS.length - 1) % PATTERNS.length]);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const idx = PATTERNS.indexOf(state.patternResult);
        actions.setPattern(PATTERNS[(idx + 1) % PATTERNS.length]);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        actions.resolveDay();
        return;
      }
    }

    if (state.mode === 'report') {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        actions.moveOfferCursor(-1);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        actions.moveOfferCursor(1);
        return;
      }
      if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space' || event.code === 'Space') {
        event.preventDefault();
        actions.toggleOfferSelection(state.offerCursor);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        actions.nextDay();
      }
    }
  });
}
