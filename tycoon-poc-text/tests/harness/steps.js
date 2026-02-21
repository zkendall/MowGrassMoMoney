/**
 * Execute an ordered step list and include step context in failures.
 */
async function runSteps(steps, executeStep) {
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    try {
      await executeStep(step, i);
    } catch (error) {
      const prefix = `Step ${i + 1}/${steps.length}${step.desc ? ` (${step.desc})` : ''}`;
      throw new Error(`${prefix} failed: ${error.message || error}`);
    }
  }
}

module.exports = {
  runSteps,
};
