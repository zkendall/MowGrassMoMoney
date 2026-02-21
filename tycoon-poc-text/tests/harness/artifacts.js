/**
 * Generate a UTC timestamp run id used in verify artifact names.
 */
function timestampRunId() {
  const d = new Date();
  const two = (value) => String(value).padStart(2, '0');
  const three = (value) => String(value).padStart(3, '0');
  return [
    d.getUTCFullYear(),
    two(d.getUTCMonth() + 1),
    two(d.getUTCDate()),
    'T',
    two(d.getUTCHours()),
    two(d.getUTCMinutes()),
    two(d.getUTCSeconds()),
    three(d.getUTCMilliseconds()),
    'Z',
  ].join('');
}

module.exports = {
  timestampRunId,
};
