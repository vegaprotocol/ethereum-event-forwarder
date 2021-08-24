# `ethereum-event-forwarder`

## Usage

Below is a sample `docker run` command, please replace with your local
settings. Also note the section on configuration below, before starting

```sh
docker run \
  --init \
  --name vega-ethereum-event-forwarder \
  --port 3001:3001 \
  --volume "$PWD/data":/data:rw \
  --volume "$PWD/secret.key":/secret.key:ro \
  --volume "$PWD/config.toml":/etc/vega-ethereum-event-forwarder/config:ro \
  vegaprotocol/ethereum-event-forwarder:latest \
  -- ARGS
```

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
log_level='info' # error, info, debug, trace, silent

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
  # Number of confirmations before forwarding an event
  confirmations = 40

  # Address and height at which to accept events from the ERC20Bridge contract
  [ethereum.erc20_bridge]
    start_height = 10817792
    address = "0x898b9F9f9Cab971d9Ceb809F93799109Abbe2D10"

  # Address and height at which to accept events from the Staking contract
  [ethereum.staking]
    start_height = 10824755
    address = "0xfc9Ad8fE9E0b168999Ee7547797BC39D55d607AA"

[vega]
  # Example, expose to the docker container and replace this
  grpc_endpoint = "127.0.0.1:3002"
```
