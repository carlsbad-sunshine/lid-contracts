pragma solidity 0.5.16;

import "./LidStaking.sol";
import "./interfaces/ILidCertifiableToken.sol";

contract V2Initializable {
  bool private initialized;

  modifier v2Initializer() {
    require(!initialized, "V2 Contract instance has already been initialized");
    initialized = true;
    _;
  }
}

contract LidStakingV2 is LidStaking, V2Initializable {

  struct Checkpoint {
      uint128 fromBlock;
      uint128 value;
  }

  mapping(address => Checkpoint[]) stakeValueHistory;

  Checkpoint[] totalStakedHistory;

  ILidCertifiableToken internal lidToken;

  function v2Initialize(
    ILidCertifiableToken _lidToken
  ) external v2Initializer onlyOwner {
    lidToken = _lidToken;
  }

  function totalStakedAt(uint _blockNumber) public view returns(uint) {
    // If we haven't initialized history yet
    if (totalStakedHistory.length == 0) {
      // Use the existing value
      return totalStaked;
    } else {
      // Binary search history for the proper staked amount
      return _getCheckpointValueAt(
        totalStakedHistory,
        _blockNumber
      );
    }
  }

  function stakeValueAt(address _owner, uint _blockNumber) public view returns (uint) {
    // If we haven't initialized history yet
    if (stakeValueHistory[_owner].length == 0) {
      // Use the existing latest value
      return stakeValue[_owner];
    } else {
      // Binary search history for the proper staked amount
      return _getCheckpointValueAt(stakeValueHistory[_owner], _blockNumber);
    }
  }

  function unstake(uint _amount) external whenStakingActive {
    require(
      _amount >= 1e18,
      "Must unstake at least one LID."
    );
    require(
      stakeValue[msg.sender] >= _amount,
      "Cannot unstake more LID than you have staked."
    );
    _removeStake(_amount);
  }

  function _removeStake(uint _amount) internal {
    // Update staker's history
    _updateCheckpointValueAtNow(
      stakeValueHistory[msg.sender],
      stakeValue[msg.sender],
      stakeValue[msg.sender].sub(_amount)
    );

    // Update total staked history
    _updateCheckpointValueAtNow(
      totalStakedHistory,
      totalStaked,
      totalStaked.sub(_amount)
    );

    // Base logic from LidStaking's external unstake function
    _superRemoveStake(_amount);
  }

  function _superRemoveStake(uint _amount) internal {
    uint tax = findTaxAmount(_amount, unstakingTaxBP);
    uint earnings = _amount.sub(tax);
    if (stakeValue[msg.sender] == _amount) totalStakers = totalStakers.sub(1);
    totalStaked = totalStaked.sub(_amount);
    stakeValue[msg.sender] = stakeValue[msg.sender].sub(_amount);
    uint payout = profitPerShare.mul(_amount).add(tax.mul(DISTRIBUTION_MULTIPLIER));
    stakerPayouts[msg.sender] = stakerPayouts[msg.sender] - uintToInt(payout);
    for (uint i=0; i < stakeHandlers.length; i++) {
        stakeHandlers[i].handleUnstake(msg.sender, _amount, stakeValue[msg.sender]);
    }
    _increaseProfitPerShare(tax);
    require(lidToken.transferFrom(address(this), msg.sender, earnings), "Unstake failed due to failed transfer.");
    emit OnUnstake(msg.sender, _amount, tax);
  }

  function _addStake(uint _amount) internal returns (uint tax) {
    // Update staker's history
    _updateCheckpointValueAtNow(
      stakeValueHistory[msg.sender],
      stakeValue[msg.sender],
      stakeValue[msg.sender].add(_amount)
    );

    // Update total staked history
    _updateCheckpointValueAtNow(
      totalStakedHistory,
      totalStaked,
      totalStaked.add(_amount)
    );

    return super._addStake(_amount);
  }

  function _getCheckpointValueAt(Checkpoint[] storage checkpoints, uint _block) view internal returns (uint) {
    // This case should be handled by caller
    if (checkpoints.length == 0)
      return 0;

    // Use the latest checkpoint
    if (_block >= checkpoints[checkpoints.length-1].fromBlock)
      return checkpoints[checkpoints.length-1].value;

    // Use the oldest checkpoint
    if (_block < checkpoints[0].fromBlock)
      return checkpoints[0].value;

    // Binary search of the value in the array
    uint min = 0;
    uint max = checkpoints.length-1;
    while (max > min) {
      uint mid = (max + min + 1) / 2;
      if (checkpoints[mid].fromBlock<=_block) {
        min = mid;
      } else {
        max = mid-1;
      }
    }
    return checkpoints[min].value;
  }

  function _updateCheckpointValueAtNow(
    Checkpoint[] storage checkpoints,
    uint _oldValue,
    uint _value
  ) internal {
    require(_value <= uint128(-1));
    require(_oldValue <= uint128(-1));

    if (checkpoints.length == 0) {
      Checkpoint storage genesis = checkpoints[checkpoints.length++];
      genesis.fromBlock = uint128(block.number - 1);
      genesis.value = uint128(_oldValue);
    }

    if (checkpoints[checkpoints.length - 1].fromBlock < block.number) {
      Checkpoint storage newCheckPoint = checkpoints[checkpoints.length++];
      newCheckPoint.fromBlock = uint128(block.number);
      newCheckPoint.value = uint128(_value);
    } else {
      Checkpoint storage oldCheckPoint = checkpoints[checkpoints.length - 1];
      oldCheckPoint.value = uint128(_value);
    }
  }
}
