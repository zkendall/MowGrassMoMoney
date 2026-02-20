import { LOG_LEVEL } from './constants.js';

const LEVEL_PRIORITY = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  NONE: 99,
};

function shouldLog(level) {
  const current = LEVEL_PRIORITY[LOG_LEVEL] ?? LEVEL_PRIORITY.INFO;
  const target = LEVEL_PRIORITY[level] ?? LEVEL_PRIORITY.INFO;
  return target >= current;
}

function recordLog(level, message) {
  if (typeof window === 'undefined') return;
  if (!Array.isArray(window.__tycoonLogs)) window.__tycoonLogs = [];
  window.__tycoonLogs.push({
    level,
    message,
    ts: Date.now(),
  });
  if (window.__tycoonLogs.length > 200) {
    window.__tycoonLogs.splice(0, window.__tycoonLogs.length - 200);
  }
}

export function log(level, message) {
  if (!shouldLog(level)) return;
  recordLog(level, message);
  const prefix = `[tycoon][${level}]`;
  if (level === 'WARN') {
    console.warn(`${prefix} ${message}`);
    return;
  }
  if (level === 'ERROR') {
    console.error(`${prefix} ${message}`);
    return;
  }
  console.log(`${prefix} ${message}`);
}

export function logDebug(message) {
  log('DEBUG', message);
}

export function logInfo(message) {
  log('INFO', message);
}
