// Pin the zone before test workers start (setting TZ inside a test file is too late) so date tests are deterministic.
module.exports = () => {
  process.env.TZ = 'America/New_York';
};
