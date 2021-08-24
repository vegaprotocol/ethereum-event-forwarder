const { abi } = require('eth-serde')
const { utils } = require('eth-helpers')

module.exports = {
  AssetWithdrawn: utils.format.bytes(abi.eventID('Asset_Withdrawn', ['address', 'address', 'uint256', 'bytes32'])),
  AssetDeposited: utils.format.bytes(abi.eventID('Asset_Deposited', ['address', 'address', 'uint256', 'bytes32'])),
  AssetDepositMinimumSet: utils.format.bytes(abi.eventID('Asset_Deposit_Minimum_Set', ['address', 'uint256', 'uint256'])),
  AssetDepositMaximumSet: utils.format.bytes(abi.eventID('Asset_Deposit_Maximum_Set', ['address', 'uint256', 'uint256'])),
  AssetListed: utils.format.bytes(abi.eventID('Asset_Listed', ['address', 'bytes32', 'uint256'])),
  AssetRemoved: utils.format.bytes(abi.eventID('Asset_Removed', ['address', 'uint256'])),
  StakeDeposited: utils.format.bytes(abi.eventID('Stake_Deposited', ['address', 'uint256', 'bytes32'])),
  StakeRemoved: utils.format.bytes(abi.eventID('Stake_Removed', ['address', 'uint256', 'bytes32'])),
  StakeTransferred: utils.format.bytes(abi.eventID('Stake_Transferred', ['address', 'uint256', 'address', 'bytes32']))
}
