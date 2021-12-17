class Request {
  constructor (rpc, method, args = [], opts) {
    this.rpc = rpc
    this.method = method
    this.args = args
    this.opts = opts

    this.promise = null
  }

  then (resolve, reject) {
    if (this.promise == null) this.promise = this.rpc.request(this.method, this.args, this.opts)
    return this.promise.then(resolve, reject)
  }

  catch (reject) {
    if (this.promise == null) this.promise = this.rpc.request(this.method, this.args, this.opts)
    return this.promise.catch(reject)
  }

  finally (cb) {
    if (this.promise == null) this.promise = this.rpc.request(this.method, this.args, this.opts)
    return this.promise.finally(cb)
  }
}

module.exports = class ETH {
  constructor (rpc) {
    this.rpc = rpc
  }

  subscribe (req, opts, cb) {
    if (cb == null) cb = opts
    return req.rpc.subscribe(req.method, req.args, req.opts, cb)
  }

  accounts (opts) {
    return new Request(this.rpc, 'eth_accounts', [], opts)
  }

  blockNumber (opts) {
    return new Request(this.rpc, 'eth_blockNumber', [], opts)
  }

  call (obj, from, opts) {
    return new Request(this.rpc, 'eth_call', from ? [obj, from] : [obj], opts)
  }

  chainId (opts) {
    return new Request(this.rpc, 'eth_chainId', [], opts)
  }

  coinbase (opts) {
    return new Request(this.rpc, 'eth_coinbase', [], opts)
  }

  estimateGas (obj, from, opts) {
    return new Request(this.rpc, 'eth_estimateGas', from ? [obj, from] : [obj], opts)
  }

  gasPrice (opts) {
    return new Request(this.rpc, 'eth_gasPrice', [], opts)
  }

  getBalance (obj, from, opts) {
    return new Request(this.rpc, 'eth_getBalance', from ? [obj, from] : [obj], opts)
  }

  getBlockByHash (hash, tx, opts) {
    return new Request(this.rpc, 'eth_getBlockByHash', [hash, tx || false], opts)
  }

  getBlockByNumber (n, tx, opts) {
    return new Request(this.rpc, 'eth_getBlockByNumber', [n, tx || false], opts)
  }

  getBlockTransactionCountByHash (hash, opts) {
    return new Request(this.rpc, 'eth_getBlockTransactionCountByHash', [hash], opts)
  }

  getBlockTransactionCountByNumber (n, opts) {
    return new Request(this.rpc, 'eth_getBlockTransactionCountByNumber', [n], opts)
  }

  getCode (addr, from, opts) {
    return new Request(this.rpc, 'eth_getCode', from ? [addr, from] : [addr], opts)
  }

  getFilterChanges (id, opts) {
    return new Request(this.rpc, 'eth_getFilterChanges', [id], opts)
  }

  getFilterLogs (id, opts) {
    return new Request(this.rpc, 'eth_getFilterLogs', [id], opts)
  }

  getLogs (obj, opts) {
    return new Request(this.rpc, 'eth_getLogs', [obj], opts)
  }

  getStorageAt (addr, pos, from, opts) {
    return new Request(this.rpc, 'eth_getStorageAt', from ? [addr, pos, from] : [addr, pos], opts)
  }

  getTransactionByBlockHashAndIndex (hash, pos, opts) {
    return new Request(this.rpc, 'eth_getTransactionByBlockHashAndIndex', [hash, pos], opts)
  }

  getTransactionByBlockNumberAndIndex (hash, pos, opts) {
    return new Request(this.rpc, 'eth_getTransactionByBlockNumberAndIndex', [hash, pos], opts)
  }

  getTransactionByHash (hash, opts) {
    return new Request(this.rpc, 'eth_getTransactionByHash', [hash], opts)
  }

  getTransactionCount (addr, from, opts) {
    return new Request(this.rpc, 'eth_getTransactionCount', from ? [addr, from] : [addr], opts)
  }

  getTransactionReceipt (hash, opts) {
    return new Request(this.rpc, 'eth_getTransactionReceipt', [hash], opts)
  }

  getUncleByBlockHashAndIndex (hash, pos, opts) {
    return new Request(this.rpc, 'eth_getUncleByBlockHashAndIndex', [hash, pos], opts)
  }

  getUncleByBlockNumberAndIndex (n, pos, opts) {
    return new Request(this.rpc, 'eth_getUncleByBlockNumberAndIndex', [n, pos], opts)
  }

  getUncleCountByBlockHash (hash, opts) {
    return new Request(this.rpc, 'eth_getUncleCountByBlockHash', [hash], opts)
  }

  getUncleCountByBlockNumber (hash, opts) {
    return new Request(this.rpc, 'eth_getUncleCountByBlockNumber', [hash], opts)
  }

  getWork (opts) {
    return new Request(this.rpc, 'eth_getWork', [], opts)
  }

  hashrate (opts) {
    return new Request(this.rpc, 'eth_hashrate', [], opts)
  }

  mining (opts) {
    return new Request(this.rpc, 'eth_mining', [], opts)
  }

  newBlockFilter (opts) {
    return new Request(this.rpc, 'eth_newBlockFilter', [], opts)
  }

  newFilter (obj, opts) {
    return new Request(this.rpc, 'eth_newFilter', [obj], opts)
  }

  newPendingTransactionFilter (opts) {
    return new Request(this.rpc, 'eth_newPendingTransactionFilter', [], opts)
  }

  protocolVersion (opts) {
    return new Request(this.rpc, 'eth_protocolVersion', [], opts)
  }

  sendRawTransaction (data, opts) {
    return new Request(this.rpc, 'eth_sendRawTransaction', [data], opts)
  }

  sendTransaction (data, opts) {
    return new Request(this.rpc, 'eth_sendTransaction', [data], opts)
  }

  sign (addr, data, opts) {
    return new Request(this.rpc, 'eth_sign', [addr, data], opts)
  }

  signTransaction (obj, opts) {
    return new Request(this.rpc, 'eth_signTransaction', [obj], opts)
  }

  submitHashrate (a, b, opts) {
    return new Request(this.rpc, 'eth_submitHashrate', [a, b], opts)
  }

  submitWork (a, b, c, opts) {
    return new Request(this.rpc, 'eth_submitWork', [a, b, c], opts)
  }

  syncing (opts) {
    return new Request(this.rpc, 'eth_syncing', [], opts)
  }

  uninstallFilter (id, opts) {
    return new Request(this.rpc, 'eth_uninstallFilter', [id], opts)
  }

  end () {
    return this.rpc.end ? this.rpc.end() : Promise.resolve()
  }

  destroy () {
    if (this.rpc.destroy) this.rpc.destroy()
  }

  get destroyed () {
    return !!this.rpc.destroyed
  }

  static hexToBigInt (s) {
    return BigInt(s, 16)
  }

  static bigIntToHex (n) {
    return '0x' + n.toString(16)
  }

  static hexToNumber (s) {
    return Number(s, 16)
  }

  static numberToHex (n) {
    return '0x' + n.toString(16)
  }
}
