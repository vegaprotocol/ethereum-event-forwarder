const http = require('http')
const path = require('path')
const fs = require('fs/promises')

const Nanoeth = require('nanoeth/http')
const GoogleRPC = require('@grpc/grpc-js')
const { vega } = require('@vegaprotocol/vega-grpc')
const { parse } = require('eth-helpers').utils

const crypto = require('./lib/crypto')
const EthTail = require('./lib/eth-tail')
const pc = require('./lib/promisify-callback')

const ListNetworkParametersRequest = vega.api.v1.corestate.ListNetworkParametersRequest

const config = require('rc-toml')('vega-ethereum-event-forwarder')
const logger = require('pino')({
  level: process.env.LOG_LEVEL ?? config?.log_level ?? 'trace'
})

if (config.primaryConfig == null) {
  logger.fatal('Failed to read config file')
  process.exit(1)
}

const db = require('toiletdb')(path.resolve(config.event_queue.datadir, 'db.json'))

logger.info('Starting')
logger.info(`Using primary config file '${config.primaryConfig}'`)
logger.info(`LOG_LEVEL: ${logger.level}`)

let t
const healthcheckHttp = http.createServer((req, res) => {
  logger.debug('HTTP Healthcheck')
  res
    .writeHead(200, {
      'Content-Type': 'application/json'
    })
    .end(JSON.stringify({
      status: (!t?.stopped) ?? false
    }))
})

logger.info(`Connecting to Vega GRPC on '${config.vega.grpc_endpoint}'`)
/* eslint-disable-next-line new-cap */
const grpc = new vega.api.v1.core_grpc.CoreServiceClient(
  config.vega.grpc_endpoint,
  GoogleRPC.credentials.createInsecure()
)

healthcheckHttp.listen(config.event_queue.healthcheck_port, config.event_queue.healthcheck_iface)
;(async () => {
  await fs.mkdir(path.resolve(config.event_queue.datadir), { recursive: true })
  await db.open()

  const networkConfigJson = await readNetworkConfig()

  if (networkConfigJson == null) return logger.fatal('Empty Vega network config')

  let networkConfig
  try {
    networkConfig = JSON.parse(networkConfigJson)
  } catch {
    return logger.fatal('Failed to parse Vega network config')
  }

  const confirmations = networkConfig.confirmations
  if (confirmations < 3) return logger.fatal(`Confirmations set too low. Got ${confirmations}, expected at least 3`)
  const stakingAddresses = networkConfig.staking_addresses.map(a => a.toLowerCase())
  const erc20BridgeAddress = networkConfig.bridge_address.toLowerCase()

  logger.info('Read Vega network config')
  logger.info(`Confirmations: ${confirmations}`)
  logger.info(`Staking bridge addresses: ${stakingAddresses.join(', ')}`)
  logger.info(`ERC20 bridge address: ${erc20BridgeAddress}`)

  const keypair = await crypto.ensureKey(path.resolve(config.event_queue.secretkey_path))
  logger.info(`Using public key: '${keypair.publicKey.toString('hex')}'`)

  const eth = new Nanoeth(config.ethereum.http_endpoint)

  const stakingStartHeight = await optionalHeight(config.ethereum.staking.start_height)
  const erc20BridgeStartHeight = await optionalHeight(config.ethereum.erc20_bridge.start_height)
  logger.info(`Staking bridge minimum start height: ${stakingStartHeight}`)
  logger.info(`ERC20 bridge minimum start height: ${erc20BridgeStartHeight}`)

  const startHeight = await db.read('checkpoint') ??
    Math.min(
      erc20BridgeStartHeight,
      stakingStartHeight
    )

  logger.info(`Starting at block: ${startHeight}`)

  t = new EthTail({
    eth,
    startHeight,
    confirmations,
    stakingAddresses,
    stakingStartHeight,
    erc20BridgeAddress,
    erc20BridgeStartHeight,
    db,
    grpc,
    keypair,
    logger
  })

  t.start()

  process.once('SIGINT', onstop)
  process.once('SIGTERM', onstop)

  async function onstop () {
    if (t.stopped) return
    logger.info('Stopping')
    await t.stop()
    await pc(cb => healthcheckHttp.close(cb))
  }

  async function latestBlockNumber (eth) {
    let retries = 0
    while (true) {
      retries++
      try {
        return await eth.blockNumber('latest')
      } catch {
        if (retries % 5 === 0) logger.warn(`Retried eth_blockNumber('latest') ${retries} times`)
      }
    }
  }

  async function optionalHeight (height) {
    if (height < 0) height = parse.number(await latestBlockNumber(eth))
    return height
  }

  async function readNetworkConfig () {
    const grpcCorestate = new vega.api.v1.corestate_grpc.CoreStateServiceClient(
      config.vega.grpc_endpoint,
      GoogleRPC.credentials.createInsecure()
    )

    await pc(cb => grpcCorestate.waitForReady(
      new Date(Date.now() + 5000),
      cb)
    )

    const networkConfigResponse = await pc((cb) => grpcCorestate.listNetworkParameters(new ListNetworkParametersRequest(), cb))
    await pc((cb) => grpcCorestate.close(cb))
    return networkConfigResponse.getNetworkParametersList().find(kv => kv.getKey() === 'blockchains.ethereumConfig')
  }
})()
