pragma solidity 0.5.16;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./LidStakingV2.sol";
import "./LidToken.sol";

contract LidVotingRights is Initializable, ERC20Detailed {

  LidStakingV2 public lidStaking;
  LidToken public lidToken;

  function initialize(
    LidStakingV2 _lidStaking,
    LidToken _lidToken
  ) external initializer {
    lidStaking = _lidStaking;
    lidToken = _lidToken;
    ERC20Detailed.initialize(
      "LID Voting Rights",
      "LID-VR",
      lidToken.decimals()
    );
  }

  function balanceOf(address _owner) external view returns (uint) {
    return lidStaking.stakeValue(_owner);
  }

  function totalSupply() external view returns (uint) {
    return lidStaking.totalStaked();
  }

  function balanceOfAt(address _owner, uint _blockNumber) external view returns (uint) {
    return lidStaking.stakeValueAt(_owner, _blockNumber);
  }

  function totalSupplyAt(uint _blockNumber) external view returns (uint) {
    return lidStaking.totalStakedAt(_blockNumber);
  }

  function allowance(address, address) external view returns (uint256){
    revert("allowance Not Supported");
  }

  function approve(address, uint256) external returns (bool){
    revert("approve Not Supported");
  }

  function transfer(address, uint) external returns (bool) {
    revert("transfer Not Supported");
  }

  function transferFrom(address, address, uint) external returns (bool) {
    revert("transferFrom Not Supported");
  }
}
