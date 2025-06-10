// CommonJS wrapper for subscription module
const subscriptionCore = require('./core.js');
const subscriptionStripe = require('./stripe.js');

module.exports = {
  ...subscriptionCore,
  ...subscriptionStripe
}; 