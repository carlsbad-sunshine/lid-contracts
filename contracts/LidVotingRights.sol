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
  }

  function name() public view returns (string memory) {
    return "LID Voting Rights";
  }

  function symbol() public view returns (string memory) {
    return "LID-VR";
  }

  function decimals() public view returns (uint8) {
    return lidToken.decimals();
  }

  function balanceOf(address _owner) public view returns (uint) {
    return lidStaking.stakeValue(_owner);
  }

  function totalSupply() public view returns (uint) {
    return lidStaking.totalStaked();
  }

  function balanceOfAt(address _owner, uint _blockNumber) public view returns (uint) {
    return lidStaking.stakeValueAt(_owner, _blockNumber);
  }

  function totalSupplyAt(uint _blockNumber) public view returns (uint) {
    return lidStaking.totalStakedAt(_blockNumber);
  }
}
