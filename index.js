const http = require('http')
const path = require('path')
const fs = require('fs/promises')

const Nanoeth = require('nanoeth/http')
const GoogleRPC = require('@grpc/grpc-js')
const VegaGrpc = require('@vegaprotocol/vega-grpc')
const { parse } = require('eth-helpers').utils

const crypto = require('./lib/crypto')
const EthTail = require('./lib/eth-tail')
const pc = require('./lib/promisify-callback')

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
const grpc = new VegaGrpc.api.trading_grpc.TradingServiceClient(
  config.vega.grpc_endpoint,
  GoogleRPC.credentials.createInsecure()
)

healthcheckHttp.listen(config.event_queue.healthcheck_port, config.event_queue.healthcheck_iface)
;(async () => {
  await fs.mkdir(path.resolve(config.event_queue.datadir), { recursive: true })
  await db.open()

  const keypair = await crypto.ensureKey(path.resolve(config.event_queue.secretkey_path))
  logger.info(`Using public key: '${keypair.publicKey.toString('hex')}'`)

  const eth = new Nanoeth(config.ethereum.http_endpoint)
  let erc20BridgeStartHeight = config.ethereum.erc20_bridge.start_height
  if (erc20BridgeStartHeight < 0) erc20BridgeStartHeight = parse.number(await eth.blockNumber('latest'))

  let stakingStartHeight = config.ethereum.staking.start_height
  if (stakingStartHeight < 0) stakingStartHeight = parse.number(await eth.blockNumber('latest'))

  const startHeight = await db.read('checkpoint') ??
    Math.min(
      erc20BridgeStartHeight,
      stakingStartHeight
    )

  logger.info(`Starting at block: ${startHeight}`)
  t = new EthTail({
    eth,
    startHeight,
    confirmations: config.ethereum.confirmations,
    stakingAddresses: config.ethereum.staking.addresses.map(function (address) { return address.toLowerCase() }),
    stakingStartHeight,
    erc20BridgeAddress: config.ethereum.erc20_bridge.address.toLowerCase(),
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
})()
