# `ethereum-event-forwarder`

## Usage

```sh
docker run \
  --init \
  --name vega-ethereum-event-forwarder \
  --port 3001:3001 \
  --volume \
  --volume \
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
  healthcheck_port = 3001

  datadir = '/data'
  secretkey_path = '/secret.key'

[ethereum]
  # Example
  http_endpoint = "https://ropsten.infura.io/v3/d98154612ecd408ca30d9756a9add9fd"
  #
  confirmations = 6

  [ethereum.erc20_bridge]
    start_height = 10817792
    address = "0x898b9F9f9Cab971d9Ceb809F93799109Abbe2D10"

  [ethereum.staking]
    start_height = 10824755
    address = "0xfc9Ad8fE9E0b168999Ee7547797BC39D55d607AA"

[vega]
  # Example
  grpc_endpoint = "127.0.0.1:3002"
```
