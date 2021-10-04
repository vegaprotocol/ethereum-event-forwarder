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

const PropagateChainEventRequest = VegaGrpc.api.v1.core.PropagateChainEventRequest

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
    stakingAddresses,
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
          logger.debug('Received ERC20Bridge event before start height')
          return
        }

        for (let i = 0; i < stakingAddresses.length; i++) {
          if (log.address === stakingAddresses[i] && parse.number(log.blockNumber) < stakingStartHeight) {
            logger.debug('Received Staking event before start height')
            return
          }
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

        if (logger.isLevelEnabled('trace')) {
          logger.trace({
            grpcReq: {
              pubKey: publicKeyHex,
              signature: signature.toString('hex'),
              eventBuffer: Buffer.from(eventBuf).toString('hex'),
              event: {
                txId: event.getTxId(),
                nonce: event.getNonce()
              }
            }
          }, 'Sending PropagateChainEventRequest')
        }
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

    for (let i = 0; i < stakingAddresses.length; i++) {
      this._iter.addFilter(stakingAddresses[i], [
        EthEvents.StakeDeposited,
        EthEvents.StakeRemoved
      ])
    }
  }

  async _onassetwithdrawn (event, log) {
    this._logger.debug('Received AssetWithdrawn')
    const assetAddress = format.address(parse.bytes(log.topics[2]).slice(12))
    const [, nonce] = abi.decodeOutput(['uint256', 'uint256'], log.data)
    event.setErc20(
      new ERC20Event()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setWithdrawal(
          new ERC20Withdrawal()
            .setVegaAssetId(parse.bytes(await this._getVegaAssetId(assetAddress)).toString('hex'))
            .setTargetEthereumAddress(format.address(parse.bytes(log.topics[1]).slice(12)))
            .setReferenceNonce(nonce.toString())
        )
    )

    if (this._logger.isLevelEnabled('trace')) {
      this._logger.trace({
        erc20event: {
          block: event.getErc20().getBlock(),
          index: event.getErc20().getIndex(),
          withdrawal: {
            vegaAssetId: event.getErc20().getWithdrawal().getVegaAssetId(),
            targetEthereumAddress: event.getErc20().getWithdrawal().getTargetEthereumAddress(),
            referenceNonce: event.getErc20().getWithdrawal().getReferenceNonce()
          }
        }
      }, 'ERC20Withdrawal event')
    }
  }

  async _onassetdeposited (event, log) {
    this._logger.debug('Received AssetDeposited')
    const [amount, vegaPublicKey] = abi.decodeOutput(['uint256', 'bytes32'], log.data)
    const assetAddress = format.address(parse.bytes(log.topics[2]).slice(12))
    event.setErc20(
      new ERC20Event()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setDeposit(
          new ERC20Deposit()
            .setVegaAssetId(parse.bytes(await this._getVegaAssetId(assetAddress)).toString('hex'))
            .setSourceEthereumAddress(format.address(parse.bytes(log.topics[1]).slice(12)))
            .setTargetPartyId(vegaPublicKey.toString('hex'))
            .setAmount(amount.toString())
        )
    )

    if (this._logger.isLevelEnabled('trace')) {
      this._logger.trace({
        erc20event: {
          block: event.getErc20().getBlock(),
          index: event.getErc20().getIndex(),
          deposit: {
            vegaAssetId: event.getErc20().getDeposit().getVegaAssetId(),
            targetEthereumAddress: event.getErc20().getDeposit().getSourceEthereumAddress(),
            targetPartyId: event.getErc20().getDeposit().getTargetPartyId(),
            amount: event.getErc20().getDeposit().getAmount()
          }
        }
      }, 'ERC20Deposit event')
    }
  }

  async _onassetlisted (event, log) {
    this._logger.debug('Received AssetListed')
    event.setErc20(
      new ERC20Event()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setAssetList(
          new ERC20AssetList()
            .setVegaAssetId(parse.bytes(log.topics[2]).toString('hex'))
        )
    )

    if (this._logger.isLevelEnabled('trace')) {
      this._logger.trace({
        erc20event: {
          block: event.getErc20().getBlock(),
          index: event.getErc20().getIndex(),
          assetList: {
            vegaAssetId: event.getErc20().getAssetList().getVegaAssetId()
          }
        }
      }, 'ERC20AssetListed event')
    }
  }

  async _onerc20assetremoved (event, log) {
    this._logger.debug('Received AssetRemoved')
    const assetAddress = format.address(parse.bytes(log.topics[1]).slice(12))
    event.setErc20(
      new ERC20Event()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setAssetDelist(
          new ERC20AssetDelist()
            .setVegaAssetId(parse.bytes(await this._getVegaAssetId(assetAddress)).toString('hex'))
        )
    )

    if (this._logger.isLevelEnabled('trace')) {
      this._logger.trace({
        erc20event: {
          block: event.getErc20().getBlock(),
          index: event.getErc20().getIndex(),
          assetDelist: {
            vegaAssetId: event.getErc20().getAssetDelist().getVegaAssetId()
          }
        }
      }, 'ERC20AssetDelist event')
    }
  }

  async _onstakedeposited (event, log) {
    this._logger.debug('Received StakeDeposited')
    event.setStakingEvent(
      new StakingEvent()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setStakeDeposited(
          new StakeDeposited()
            .setEthereumAddress(format.address(parse.bytes(log.topics[1]).slice(12)))
            .setVegaPublicKey(parse.bytes(log.topics[2]).toString('hex'))
            .setAmount(parse.bigint(log.data).toString())
            .setBlockTime(parse.number((await this.getBlockByHash(log.blockHash)).timestamp))
        )
    )

    if (this._logger.isLevelEnabled('trace')) {
      this._logger.trace({
        stakingEvent: {
          block: event.getStakingEvent().getBlock(),
          index: event.getStakingEvent().getIndex(),
          stakeDeposited: {
            ethereumAddress: event.getStakingEvent().getStakeDeposited().getEthereumAddress(),
            vegaPublicKey: event.getStakingEvent().getStakeDeposited().getVegaPublicKey(),
            amount: event.getStakingEvent().getStakeDeposited().getAmount(),
            blockTime: event.getStakingEvent().getStakeDeposited().getBlockTime()
          }
        }
      }, 'StakeDeposited event')
    }
  }

  async _onstakeremoved (event, log) {
    this._logger.debug('Received StakeRemoved')
    event.setStakingEvent(
      new StakingEvent()
        .setBlock(parse.number(log.blockNumber))
        .setIndex(parse.number(log.logIndex))
        .setStakeRemoved(
          new StakeRemoved()
            .setEthereumAddress(format.address(parse.bytes(log.topics[1]).slice(12)))
            .setVegaPublicKey(parse.bytes(log.topics[2]).toString('hex'))
            .setAmount(parse.bigint(log.data).toString())
            .setBlockTime(parse.number((await this.getBlockByHash(log.blockHash)).timestamp))
        )
    )

    if (this._logger.isLevelEnabled('trace')) {
      this._logger.trace({
        stakingEvent: {
          block: event.getStakingEvent().getBlock(),
          index: event.getStakingEvent().getIndex(),
          stakeRemoved: {
            ethereumAddress: event.getStakingEvent().getStakeRemoved().getEthereumAddress(),
            vegaPublicKey: event.getStakingEvent().getStakeRemoved().getVegaPublicKey(),
            amount: event.getStakingEvent().getStakeRemoved().getAmount(),
            blockTime: event.getStakingEvent().getStakeRemoved().getBlockTime()
          }
        }
      }, 'StakeRemoved event')
    }
  }

  async _getVegaAssetId (address) {
    return await this.ethCall({
      to: this._erc20BridgeAddress,
      data: '0x' + abi.encodeMethod('get_vega_asset_id', ['address'], [address]).toString('hex')
    }, 'latest')
  }

  async getBlockByHash (hash) {
    let retries = 0
    while (true) {
      retries++
      try {
        return await this._eth.getBlockByHash(hash)
      } catch {
        if (retries % 5 === 0) this._logger.warn(`Retried eth_getBlockByHash('${hash}') ${retries} times`)
      }
    }
  }

  async ethCall (opts, height) {
    let retries = 0
    while (true) {
      retries++
      try {
        return await this._eth.call(opts, height)
      } catch {
        if (retries % 5 === 0) this._logger.warn(`Retried eth_call(${JSON.stringify(opts)}, '${height}') ${retries} times`)
      }
    }
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
