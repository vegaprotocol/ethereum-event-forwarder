const VegaGrpc = require('@vegaprotocol/vega-grpc')
const crypto = require('./crypto')
const EthEvents = require('./eth-events')
const pc = require('./promisify-callback')
const EthTransactionIterator = require('./eth-log-iterator')

const { format, parse } = require('eth-helpers').utils
const { abi } = require('eth-serde')

// Aliases
const ChainEvent = VegaGrpc.commands.v1.validator_commands.ChainEvent

const ERC20Event = VegaGrpc.chain_events.ERC20Event
const ERC20AssetList = VegaGrpc.chain_events.ERC20AssetList
const ERC20AssetDelist = VegaGrpc.chain_events.ERC20AssetDelist
const ERC20Deposit = VegaGrpc.chain_events.ERC20Deposit
const ERC20Withdrawal = VegaGrpc.chain_events.ERC20Withdrawal
const StakingEvent = VegaGrpc.chain_events.StakingEvent
const StakeDeposited = VegaGrpc.chain_events.StakeDeposited
const StakeRemoved = VegaGrpc.chain_events.StakeRemoved

const PropagateChainEventRequest = VegaGrpc.api.trading.PropagateChainEventRequest

module.exports = class EthTail {
  constructor ({
    eth,
    grpc,
    db,
    keypair,
    startHeight,
    confirmations,
    erc20BridgeAddress,
    erc20BridgeStartHeight,
    stakingAddress,
    stakingStartHeight,
    logger
  }) {
    this._eth = eth
    this._grpc = grpc
    this._db = db

    this._grpcDeadline = 5000
    this._nonce = 0

    this.stopped = false

    this._keypair = keypair
    const publicKeyHex = keypair.publicKey.toString('hex')

    this._logger = logger
    this._erc20BridgeAddress = erc20BridgeAddress

    this._iter = new EthTransactionIterator({
      logger,
      eth,
      confirmations,
      startHeight,
      onlog: async (log) => {
        if (log.address === erc20BridgeAddress && parse.number(log.blockNumber) < erc20BridgeStartHeight) {
          logger.trace('Received ERC20Bridge event before start height')
        }
        if (log.address === stakingAddress && parse.number(log.blockNumber) < stakingStartHeight) {
          logger.trace('Received Staking event before start height')
        }

        const event = new ChainEvent()
          .setTxId(log.transactionHash)
          .setNonce(this._nonce++)

        switch (log.topics[0]) {
          case EthEvents.AssetWithdrawn: await this._onassetwithdrawn(event, log); break
          case EthEvents.AssetDeposited: await this._onassetdeposited(event, log); break
          case EthEvents.AssetListed: await this._onassetlisted(event, log); break
          case EthEvents.ERC20AssetRemoved: await this._onerc20assetremoved(event, log); break

          case EthEvents.StakeDeposited: await this._onstakedeposited(event, log); break
          case EthEvents.StakeRemoved: await this._onstakeremoved(event, log); break
        }

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
      EthEvents.AssetListed,
      EthEvents.AssetRemoved
    ])

    this._iter.addFilter(stakingAddress, [
      EthEvents.StakeDeposited,
      EthEvents.StakeRemoved
    ])
  }

  async _onassetwithdrawn (event, log) {
    this._logger.trace('Received AssetWithdrawn')
    event.setErc20(
      new ERC20Event()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setWithdrawal(
          new ERC20Withdrawal()
            .setVegaAssetId(parse.bytes(await this._getVegaAssetId(log.topics[2])).toString('hex'))
            .setTargetEthereumAddress(format.address(parse.bytes(log.topics[1]).slice(12)))
            .setReferenceNonce(parse.bytes(log.data).slice(32).toString('hex'))
        )
    )
  }

  async _onassetdeposited (event, log) {
    this._logger.trace('Received AssetDeposited')
    const amount = parse.bigint(log.data.slice(0, 2 + 2 * 32))
    const vegaPublicKey = parse.bytes(log.data).slice(32).toString('hex')

    event.setErc20(
      new ERC20Event()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setDeposit(
          new ERC20Deposit()
            .setVegaAssetId(await this._getVegaAssetId(log.topics[2]))
            .setSourceEthereumAddress(format.address(parse.bytes(log.topics[1]).slice(12)))
            .setTargetPartyId(vegaPublicKey)
            .setAmount(amount.toString())
        )
    )
  }

  async _onassetlisted (event, log) {
    this._logger.trace('Received AssetListed')
    event.setErc20(
      new ERC20Event()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setAssetList(
          new ERC20AssetList()
            .setVegaAssetId(parse.bytes(log.topics[2]).toString('hex'))
        )
    )
  }

  async _onerc20assetremoved (event, log) {
    this._logger.trace('Received AssetRemoved')
    event.setErc20(
      new ERC20Event()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setAssetDelist(
          new ERC20AssetDelist()
            .setVegaAssetId(await this._getVegaAssetId(log.topics[1]))
        )
    )
  }

  async _onstakedeposited (event, log) {
    this._logger.trace('Received StakeDeposited')
    event.setStakingEvent(
      new StakingEvent()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setStakeDeposited(
          new StakeDeposited()
            .setEthereumAddress(format.address(parse.bytes(log.topics[1]).slice(12)))
            .setVegaPublicKey(parse.bytes(log.topics[1]).toString('hex'))
            .setAmount(parse.bigint(log.data).toString())
            .setBlockTime(parse.number((await this._eth.getBlockByHash(log.blockHash)).timestamp))
        )
    )
  }

  async _onstakeremoved (event, log) {
    this._logger.trace('Received StakeRemoved')
    event.setStakingEvent(
      new StakingEvent()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setStakeRemoved(
          new StakeRemoved()
            .setEthereumAddress(format.address(parse.bytes(log.topics[1]).slice(12)))
            .setVegaPublicKey(parse.bytes(log.topics[1]).toString('hex'))
            .setAmount(parse.bigint(log.data).toString())
            .setBlockTime(parse.number((await this._eth.getBlockByHash(log.blockHash)).timestamp))
        )
    )
  }

  async _getVegaAssetId (address) {
    return await this._eth.call({
      to: this._erc20BridgeAddress,
      data: '0x' + abi.encodeMethod('get_vega_asset_id', ['address'], [address]).toString('hex')
    }, 'latest')
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
  }
}
