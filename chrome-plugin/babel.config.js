// Babel config for jest (babel-jest). Transforms the extension's ESM files
// so they can run under jest's CommonJS module system in Node.
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }]
  ]
};
