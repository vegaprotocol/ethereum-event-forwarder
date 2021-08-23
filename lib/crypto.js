const sodium = require('sodium-native')
const fs = require('fs/promises')
const assert = require('nanoassert')
const Sha3 = require('sha3-wasm').sha3_256

const crypto = module.exports = {
  keygenFromSeed (seed) {
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)

    sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed)

    return { publicKey, secretKey }
  },
  keygen () {
    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
    const secretKey = Buffer.alloc(sodium.crypto_sign_SECRETKEYBYTES)

    sodium.crypto_sign_keypair(publicKey, secretKey)

    return { publicKey, secretKey }
  },
  async readKey (path) {
    assert(typeof path === 'string', 'path must be string')

    const secretKey = Buffer.from(await fs.readFile(path, 'utf8'), 'hex')

    // TODO: Remove this legacy code path
    if (secretKey.byteLength === sodium.crypto_sign_SEEDBYTES) {
      return crypto.keygenFromSeed(secretKey)
    }

    if (secretKey.byteLength !== sodium.crypto_sign_SECRETKEYBYTES) {
      throw new Error('Invalid secret key read from: ' + path)
    }

    const publicKey = Buffer.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
    sodium.crypto_sign_ed25519_sk_to_pk(publicKey, secretKey)

    return { publicKey, secretKey }
  },
  /* async */ writeKey (path, secretKey) {
    assert(typeof path === 'string', 'path must be string')
    assert(Buffer.isBuffer(secretKey), 'secretKey must be buffer')
    assert(secretKey.byteLength === sodium.crypto_sign_SECRETKEYBYTES, 'secretKey must be valid secret key')

    return fs.writeFile(path, secretKey.toString('hex'), {
      flag: 'wx' // Do not overwrite existing keys
    })
  },
  async ensureKey (path) {
    let keypair
    try {
      keypair = await crypto.readKey(path)
    } catch {
      keypair = crypto.keygen()
      await crypto.writeKey(path, keypair.secretKey)
    }

    return keypair
  },
  sign (message, secretKey) {
    assert(message instanceof Uint8Array, 'message must be Uint8Array or buffer')
    assert(Buffer.isBuffer(secretKey), 'secretKey must be buffer')
    assert(secretKey.byteLength === sodium.crypto_sign_SECRETKEYBYTES, 'secretKey must be valid secret key')

    const hash = Sha3()
    hash.update(message)

    const signature = Buffer.alloc(sodium.crypto_sign_BYTES)
    sodium.crypto_sign_detached(signature, hash.digest(), secretKey)

    return signature
  }
}

// Seed
// Vega Key
// Docker build
// ENV vars (check docs)
// Publish GRPC API
// Github Workflow
// Publish Docker
