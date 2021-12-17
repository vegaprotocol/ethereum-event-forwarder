// Inline patched implementation, pending PR review on nanoeth

const ETH = require('./')
const got = require('got')
module.exports = class HTTP extends ETH {
  constructor (endpoint) {
    super(new RPC(endpoint))
  }
}

class RPC {
  constructor (endpoint, opts) {
    this.endpoint = endpoint
    this.destroyed = false
    this.opts = opts
  }

  async request (method, params, opts) {
    const res = await got.post(Object.assign({
      url: this.endpoint,
      timeout: {
        response: 13 * 1000
      },
      json: {
        jsonrpc: '2.0',
        method,
        params,
        id: 1
      },
      responseType: 'json'
    }, this.opts, opts))

    if (res.body.error) {
      const error = new Error(res.body.error.message)
      error.code = res.body.error.code
      throw error
    }

    return res.body.result
  }

  subscribe () {
    throw new Error('HTTP does not support pubsub')
  }

  destroy () {}
}
