// Callback to promise helper
const InvertedPromise = require('inverted-promise')
module.exports = function pc (fn) {
  const p = new InvertedPromise()
  fn(function (err, ...args) {
    if (err) return p.reject(err)

    return p.resolve(...args)
  })
  return p
}
