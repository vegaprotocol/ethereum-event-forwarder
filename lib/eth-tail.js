const VegaGrpc = require('@vegaprotocol/vega-grpc')
const crypto = require('./crypto')
const EthEvents = require('./eth-events')
const pc = require('./promisify-callback')
const EthTransactionIterator = require('./eth-log-iterator')
const ethBloom = require('./eth-bloom')
// Aliases
const ChainEvent = VegaGrpc.commands.v1.validator_commands.ChainEvent

const ERC20Event = VegaGrpc.chain_events.ERC20Event
const ERC20AssetList = VegaGrpc.chain_events.ERC20AssetList
const ERC20AssetDelist = VegaGrpc.chain_events.ERC20AssetDelist
const ERC20Deposit = VegaGrpc.chain_events.ERC20Deposit
const ERC20Withdrawal = VegaGrpc.chain_events.ERC20Withdrawal
const StakingEvent = VegaGrpc.chain_events.StakingEvent
const StakingDeposited = VegaGrpc.chain_events.StakingDeposited
const StakingRemoved = VegaGrpc.chain_events.StakingRemoved

const PropagateChainEventRequest = VegaGrpc.api.trading.PropagateChainEventRequest

module.exports = class EthTail {
  constructor ({ eth, grpc, db, keypair, startHeight, confirmations, erc20BridgeAddress, stakingAddress, logger }) {
    this._eth = eth
    this._grpc = grpc
    this._db = db

    this._grpcDeadline = 5000
    this._nonce = 0

    this.stopped = false

    this._keypair = keypair
    const publicKeyHex = keypair.publicKey.toString('hex')

    this._logger = logger

    this._iter = new EthTransactionIterator({
      logger,
      eth,
      confirmations,
      startHeight,
      async onlog (log) {
        const event = new ChainEvent()
          .setTxId(log.transactionHash)
          .setNonce(this._nonce++)

          .setErc20(
            new ERC20Event()
              .setIndex()
              .setBlock()
              .setAssetList(
                new ERC20AssetList()
                  .setVegaAssetId()
              )
          )
          .setStakingEvent()

        const eventBuf = event.serializeBinary()
        const signature = crypto.sign(eventBuf, keypair.secretKey)
        const req = new PropagateChainEventRequest()
          .setPubKey(publicKeyHex)
          .setSignature(signature)
          .setEvent(eventBuf)
        const res = await pc((cb) => grpc.propagateChainEvent(req, cb))

        if (res.getSuccess() === false) throw new Error('ChainEvent request failed')
      },
      async oncheckpoint (height) {
        await db.write('checkpoint', height)
      }
    })

    this._iter.addFilter(erc20BridgeAddress, [
      EthEvents.AssetWithdrawn,
      EthEvents.AssetDeposited,
      EthEvents.AssetDepositMinimumSet,
      EthEvents.AssetDepositMaximumSet,
      EthEvents.AssetListed,
      EthEvents.AssetRemoved
    ].map(t => '0x' + t.toString('hex')))

    this._iter.addFilter(stakingAddress, [
      EthEvents.StakeTransferred,
      EthEvents.StakeDeposited,
      EthEvents.StakeRemoved
    ].map(t => '0x' + t.toString('hex')))
  }

  async start () {
    await this._db.open()
    await pc(cb => this._grpc.waitForReady(
      new Date(Date.now() + this._grpcDeadline),
      cb)
    )
    this._iter.start()
  }

  async stop () {
    this.stopped = true
    await this._eth.end()
    await this._iter.stop()
    this._grpc.close()
    await this._db.flush()
  }
}
