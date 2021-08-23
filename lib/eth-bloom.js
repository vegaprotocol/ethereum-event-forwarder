const sha3 = require('sha3-wasm').sha3_256

function bits (input) {
  const hash = sha3().update(input).digest()

  const b1 = (hash[0] & 0b00000111) << 8 | hash[1]
  const b2 = (hash[2] & 0b00000111) << 8 | hash[3]
  const b3 = (hash[4] & 0b00000111) << 8 | hash[5]

  return [b1, b2, b3]
}

module.exports = function (bloomfilter, topics = []) {
  const filter = Buffer.from(bloomfilter.replace('0x', ''), 'hex')

  for (const topic in topics) {
    const high = bits(topic)

    const positive = high.every(b => filter[b[0] >> 3] & (1 << (b[0] & 0b111)))
    if (positive) return true
  }

  return false
}
