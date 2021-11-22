# `ethereum-event-forwarder`
> The event forwarder monitors the Ethereum blockchain for ERC20 based
> deposits/withdrawals and ethereum based staking events

This repo is part of the the ERC20 bridge functionality for
[Vega](https://vega.xyz) networks. [Read about the architecture in this blog
post](https://medium.com/vegaprotocol/vega-erc20-bridge-331a5235efa2), or check
out the [bridge smart contracts here](https://github.com/vegaprotocol/smart-contracts).
Specifically, this project listens for staking or deposit events on known
contract addresses, and submits them to validator nodes.


## Usage

### Docker
We have provided a [dockerfile](./Dockerfile) in case you are planning to use
Docker. You can run the script below after ensuring the parameters match with
your local settings. Also note the section on configuration below, before starting

```sh
docker run \
  --init \
  --restart unless-stopped \
  --name vega-ethereum-event-forwarder \
  --port 3001:3001 \
  --volume "$PWD/data":/data:rw \
  --volume "$PWD/secret.key":/secret.key:ro \
  --volume "$PWD/config.toml":/etc/vega-ethereum-event-forwarder/config:ro \
  vegaprotocol/ethereum-event-forwarder:latest \
  ARGS
```

### Native
If you have Node.js v16 installed, you can run it without docker:

```sh
# Create directory for the config (see Config section below for options)
mkdir -p ~/.config/vega-ethereum-event-forwarder/

# Move the configuration to the path you created
cp ./config-example.toml ~/.config/vega-ethereum-event-forwarder/config

# Edit the config, then start the server
npm install --production
npm start
```

For alternative folders and how to provide the configuration path via the
command line, see the Config section below.

### Config

Configuration is in TOML format. The path to the configuration file can
be specified with the `CONFIG` env var, `--config=PATH` argument or by
placing in a well-known location:

- `$HOME/.config/vega-ethereum-event-forwarder/config`
- `/local/usr/etc/vega-ethereum-event-forwarder/config`
- `/etc/vega-ethereum-event-forwarder/config`

Sample configuration looks like below. Any of the options can be
overriden by commandline arguments eg. `--ethereum.http_endpoint=...`

```toml
log_level = 'info' # error, info, debug, trace, silent

[event_queue]
  # Use '0.0.0.0' to bind to all IPv4, '::' to bind to all IPv6 and IPv4
  healthcheck_iface = '127.0.0.1'
  # Remember to expose this port from Docker also
  healthcheck_port = 3001

  # Path to keep persistent state
  datadir = '/data'

  # Path to read secret key from. If this doesn't exist, one will be
  # written here on initial start and the public key written to the logs
  secretkey_path = '/secret.key'

[ethereum]
  # Example, replace before running
  http_endpoint = "https://ropsten.infura.io/v3/API_TOKEN"

  # Height at which to accept events from the ERC20Bridge contract
  [ethereum.erc20_bridge]
    # Use either the contract deployment height or `-1` for the current block
    # height at initial start
    start_height = 10817792

  # Height at which to accept events from the Staking contract
  [ethereum.staking]
    # Use either the contract deployment height or `-1` for the current block
    # height at initial start
    start_height = 10824755

[vega]
  # Example, expose to the docker container and replace this
  grpc_endpoint = "127.0.0.1:3002"
```

## License

[MIT](LICENSE)
