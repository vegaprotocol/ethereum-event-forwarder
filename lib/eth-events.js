const { abi } = require('eth-serde')

module.exports = {
  AssetWithdrawn: abi.eventID('Asset_Withdrawn', ['address', 'address', 'uint256', 'bytes32']),
  AssetDeposited: abi.eventID('Asset_Deposited', ['address', 'address', 'uint256', 'bytes32']),
  AssetDepositMinimumSet: abi.eventID('Asset_Deposit_Minimum_Set', ['address', 'uint256', 'uint256']),
  AssetDepositMaximumSet: abi.eventID('Asset_Deposit_Maximum_Set', ['address', 'uint256', 'uint256']),
  AssetListed: abi.eventID('Asset_Listed', ['address', 'bytes32', 'uint256']),
  AssetRemoved: abi.eventID('Asset_Removed', ['address',  'uint256']),
  StakeDeposited: abi.eventID('Stake_Deposited', ['address', 'uint256', 'bytes32']),
  StakeRemoved: abi.eventID('Stake_Removed', ['address', 'uint256', 'bytes32']),
  StakeTransferred: abi.eventID('Stake_Transferred', ['address', 'uint256', 'address', 'bytes32'])
}
