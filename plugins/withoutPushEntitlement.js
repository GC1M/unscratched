// expo-notifications always adds the aps-environment (push) entitlement. The app
// only schedules local notifications, which do not need it, and a team without
// the Push Notifications capability cannot sign a build that has it. List it
// before expo-notifications in app.json: entitlement mods run last-listed first.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = (config) =>
  withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
