import "./LidStaking.sol";

contract LidStakingV2 is LidStaking {

  struct Checkpoint {
      uint128 fromBlock;
      uint128 value;
  }

  mapping(address => Checkpoint[]) stakeValueHistory;

  Checkpoint[] totalStakedHistory;

  // TODO: require V1 stakers register for V2
  // TODO: new manual v2 initializer

  // TODO: update this history when users stake and unstake
  // Mapping of a staker's address to the block number
  // of when they've crossed the threshold
  mapping(address => uint) stakerThresoldMet;

  // TODO: initialize these 2 values + expose onlyowner setters
  // The minimum number of staked tokens required to
  // qualify for voting
  uint minimumStakeThreshold;

  // The timeout period a staker has to wait until
  // they qualify to vote
  uint stakerTimeout;

  // TODO:
  function totalStakedAtWithMin(uint _blockNumber) public view returns(uint) {
    uint staked = totalStakedAt(_blockNumber);

    // If the amount staked meets the threshold
    if (staked > minimumStakeThreshold) {
      // Verify that 
    } else {
      return 0;
    }
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
    if (stakeValueHistory[_owner].length === 0) {
      // Use the existing latest value
      return stakeValue[_owner];
    } else {
      // Binary search history for the proper staked amount
      return _getCheckpointValueAt(stakeValueHistory[_owner], _blockNumber);
    }
  }

  function unstake(uint _amount) external override whenStakingActive {
    _removeStake(_amount);
    super.unstake(_amount);
  }

  function _removeStake(uint _amount) internal virtual {
    require(
      _amount >= 1e18,
      "Must unstake at least one LID."
    );
    require(
      stakeValue[msg.sender] >= _amount,
      "Cannot unstake more LID than you have staked."
    );

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
  }

  function _addStake(uint _amount) internal override returns (uint tax) {

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

    return super._addStake(amount);
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
