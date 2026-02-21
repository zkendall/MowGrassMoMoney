const fs = require('node:fs');

/**
 * Load a scenario object from a fixture JSON file and apply defaults.
 */
function loadScenarioFromFixture({
  fixturePath,
  scenarioName,
  defaultSeed = null,
  defaultStartState = 'default',
}) {
  const raw = fs.readFileSync(fixturePath, 'utf8');
  const fixture = JSON.parse(raw);
  const scenario = fixture[scenarioName];

  if (!scenario || typeof scenario !== 'object') {
    throw new Error(`Missing scenario config: ${scenarioName}`);
  }
  if (!Array.isArray(scenario.steps)) {
    throw new Error(`Scenario "${scenarioName}" is missing steps[]`);
  }

  return {
    seed: Number.isFinite(scenario.seed) ? scenario.seed : defaultSeed,
    start_state: typeof scenario.start_state === 'string'
      ? scenario.start_state
      : defaultStartState,
    steps: scenario.steps,
  };
}

/**
 * Build a navigation URL for a scenario using optional seed/start_state params.
 */
function buildScenarioUrl(baseURL, scenario, defaultStartState = 'default') {
  const url = new URL(baseURL);
  if (Number.isFinite(scenario.seed)) {
    url.searchParams.set('seed', String(scenario.seed));
  }
  if (scenario.start_state && scenario.start_state !== defaultStartState) {
    url.searchParams.set('start_state', scenario.start_state);
  }
  return url.toString();
}

module.exports = {
  loadScenarioFromFixture,
  buildScenarioUrl,
};
