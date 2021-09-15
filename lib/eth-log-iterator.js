const EventEmitter = require('events')
const { utils } = require('eth-helpers')
const { setInterrupt } = require('set-interrupt')
const InvertedPromise = require('inverted-promise')
const UpsertMap = require('upsert-map')

const MAX_BLOCK_RANGE = 2000
const BLOCK_SLEEP = 1000 * 6

const asNumber = utils.parse.number

module.exports = class EthLogIterator extends EventEmitter {
  constructor ({ eth, confirmations, startHeight, onlog, oncheckpoint, logger }) {
    super()

    this._eth = eth
    this._confirmations = confirmations ?? 0
    this._height = startHeight ?? 0
    this._onlog = onlog ?? (() => {})
    this._oncheckpoint = oncheckpoint ?? (() => {})

    this.stopped = false
    this._wait = null

    this._blockInterrupt = null
    this._blockWait = null

    this._latestHeight = '0x0'
    this._logger = logger

    this._filters = new UpsertMap(() => new Set(), set => !set.size)
  }

  start () {
    this._wait = this._loop()
  }

  addFilter (address, topics) {
    const addr = this._filters.upsert(address)

    for (const topic of topics) addr.add(topic)
  }

  deleteFilter (address, topics) {
    const addr = this._filters.get(address)

    if (addr == null) return

    for (const topic of topics) addr.delete(topic)
  }

  async _loop () {
    while (this.stopped === false) {
      if (asNumber(this._latestHeight) - this._confirmations <= this._height) {
        this._logger.trace('Refreshing latest block height')
        const oldHeight = this._latestHeight
        this._latestHeight = await this.latestBlockNumber()
        if (this._latestHeight !== oldHeight) continue
        // Wait for half median block time, but allow interrupting to
        // continue loop and break out if stopped
        ({ interrupt: this._blockInterrupt, promise: this._blockWait } = sleep(BLOCK_SLEEP))
        await this._blockWait
        continue
      }

      const maxHeight = Math.min(this._height + MAX_BLOCK_RANGE, asNumber(this._latestHeight) - this._confirmations)

      this._logger.trace(`Fetching logs from ${this._height} to ${maxHeight}`)
      const logsByAddress = await Promise.all(Array.from(this._filters.keys(), addr => {
        return this.getLogs({
          fromBlock: this._height,
          toBlock: maxHeight,
          address: addr,
          topics: [
            Array.from(this._filters.get(addr).values())
          ]
        })
      }))

      const logs = logsByAddress.flat().sort(sortLogs)

      for (const log of logs) {
        await this._onlog(log)
      }

      await this._oncheckpoint(maxHeight)
      this._height = maxHeight + 1
    }
  }

  async latestBlockNumber () {
    let retries = 0
    while (true) {
      retries++
      try {
        return await this._eth.blockNumber('latest')
      } catch {
        if (retries % 5 === 0) this._logger.warn(`Retried eth_blockNumber('latest') ${retries} times`)
      }
    }
  }

  async getLogs (opts) {
    const { fromBlock, toBlock, address, topics } = opts
    let retries = 0
    while (true) {
      retries++
      try {
        return await this._eth.getLogs({
          fromBlock: utils.format(fromBlock),
          toBlock: utils.format(toBlock),
          address,
          topics
        })
      } catch (ex) {
        if (ex.code === -32005) { // Returned too many events, so we split in two calls
          const split = Math.floor(toBlock / 2)
          return Promise.all([
            this.getLogs({ address, topics, fromBlock, toBlock: split }),
            this.getLogs({ address, topics, toBlock, fromBlock: split + 1 })
          ]).then(logs => logs.flat())
        }
        if (retries % 5 === 0) this._logger.warn(`Retried eth_getLogs(${JSON.stringify(opts)}) ${retries} times`)
      }
    }
  }

  async stop () {
    this.stopped = true
    this._blockInterrupt?.interrupt(null, null)
    await this._wait
  }
}

function sleep (ms) {
  const p = new InvertedPromise()
  const i = setInterrupt((err, res) => {
    if (err) return p.reject(err)
    return p.resolve(res)
  }, ms)

  return { promise: p, interrupt: i }
}

function sortLogs (a, b) {
  // sort block
  // sort log index
  return asNumber(b.blockNumber) - asNumber(a.blockNumber) ||
  asNumber(b.transactionIndex) - asNumber(a.transactionIndex) ||
  asNumber(b.logIndex) - asNumber(a.logIndex)
}
