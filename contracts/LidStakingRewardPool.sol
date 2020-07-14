pragma solidity 0.5.16;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "./library/BasisPoints.sol";
import "./interfaces/IStakeHandler.sol";
import "./LidStaking.sol";


contract LidStakingRewardPool is Initializable, IStakeHandler, Ownable {
    using BasisPoints for uint;
    using SafeMath for uint;

    uint public releaseBP;
    uint public releaseInterval;
    uint public cycleStart;
    IERC20 private lidToken;
    LidStaking private lidStaking;

    mapping(address => bool) public isStakerRegistered;
    mapping(uint => mapping(address=>uint)) public cycleStakerPoolOwnership;
    mapping(uint => mapping(address=>uint)) public cycleStakerClaimed;
    mapping(uint => uint) public cyclePoolTotal;

    uint public reservedForClaims;
    uint public lastCycleSetReservedForClaims;
    mapping(uint => uint) public cycleTotalReward;

    event OnClaim(address sender, uint payout);
    event OnRegister(address sender);

    modifier onlyFromLidStaking {
        require(msg.sender == address(lidStaking), "Sender must be LidStaking sc.");
        _;
    }

    modifier onlyAfterStart {
        require(cycleStart != 0 && now > cycleStart, "Has not yet started.");
        _;
    }

    function handleStake(address staker, uint stakerDeltaValue, uint stakeValue) external onlyFromLidStaking {
        if (!isStakerRegistered[staker]) return;
        uint currentCycle = getCurrentCycleCount();
        _updateReservedForClaims(currentCycle);
        _updateStakerPoolOwnershipNextCycle(currentCycle, staker, stakeValue);
    }

    function handleUnstake(address staker, uint stakerDeltaValue, uint stakeValue) external onlyFromLidStaking {
        if (!isStakerRegistered[staker]) return;
        uint currentCycle = getCurrentCycleCount();
        _updateReservedForClaims(currentCycle);
        _updateStakerPoolOwnershipNextCycle(currentCycle, staker, stakeValue);
        _updateStakerPoolOwnershipCurrentCycle(currentCycle, staker, stakeValue);
    }

    function initialize(
        uint _releaseBP,
        uint _releaseInterval,
        uint _cycleStart,
        address _owner,
        IERC20 _lidToken,
        LidStaking _lidStaking
    ) public initializer {
        Ownable.initialize(msg.sender);

        releaseBP = _releaseBP;
        releaseInterval = _releaseInterval;
        cycleStart = _cycleStart;
        lidToken = _lidToken;
        lidStaking = _lidStaking;

        //Due to issue in oz testing suite, the msg.sender might not be owner
        _transferOwnership(_owner);
    }

    function register() public {
        isStakerRegistered[msg.sender] = true;

        uint currentCycle = getCurrentCycleCount();

        _updateReservedForClaims(currentCycle);
        _updateStakerPoolOwnershipNextCycle(currentCycle, msg.sender, lidStaking.stakeValue(msg.sender));

        emit OnRegister(msg.sender);
    }

    function claim(uint requestCycle) public onlyAfterStart {
        uint currentCycle = getCurrentCycleCount();
        uint payout = calculatePayout(msg.sender, currentCycle);

        _updateReservedForClaims(currentCycle);
        _updateStakerPoolOwnershipNextCycle(currentCycle, msg.sender, lidStaking.stakeValue(msg.sender));
        _updateClaimReservations(currentCycle, requestCycle, payout, msg.sender);

        lidToken.transfer(msg.sender, payout);

        emit OnClaim(msg.sender, payout);
    }

    function setReleaseBP(uint _releaseBP) public onlyOwner {
        releaseBP = _releaseBP;
    }

    function setStartTime(uint _cycleStart) public onlyOwner {
        cycleStart = _cycleStart;
    }

    function calculatePayout(address staker, uint cycle) public view returns (uint) {
        if (!isStakerRegistered[staker]) return 0;
        if (cycleStakerClaimed[cycle][staker] != 0) return 0;
        if (cycleTotalReward[cycle] == 0) return 0;

        uint cycleTotalPool = cyclePoolTotal[cycle];
        uint stakerPoolOwnership = cycleStakerPoolOwnership[cycle][staker];
        uint totalReward = cycleTotalReward[cycle];

        if (cycleTotalPool == 0) return 0;
        return totalReward.mul(stakerPoolOwnership).div(cycleTotalPool);
    }

    function getCurrentCycleCount() public view returns (uint) {
        if (now <= cycleStart) return 0;
        return now.sub(cycleStart).div(releaseInterval).add(1);
    }

    function _updateReservedForClaims(uint currentCycle) internal {
        uint nextCycle = currentCycle.add(1);
        if (nextCycle <= lastCycleSetReservedForClaims) return;

        lastCycleSetReservedForClaims = nextCycle;

        uint newlyReservedLid = lidToken.balanceOf(address(this)).sub(reservedForClaims).mulBP(releaseBP);
        reservedForClaims = reservedForClaims.add(newlyReservedLid);
        cycleTotalReward[nextCycle] = newlyReservedLid;
    }

    function _updateClaimReservations(uint currentCycle, uint requestCycle, uint payout, address claimer) internal {
        require(isStakerRegistered[claimer], "Must register to be eligble for rewards.");
        require(requestCycle > 0, "Cannot claim for tokens staked before first cycle starts.");
        require(currentCycle > requestCycle, "Can only claim for previous cycles.");
        require(cycleStakerPoolOwnership[requestCycle][claimer] > 0, "Must have pool ownership for cycle.");
        require(cycleStakerClaimed[requestCycle][claimer] == 0, "Must not have claimed for cycle.");
        require(payout > 0, "Payout must be greater than 0.");
        cycleStakerClaimed[requestCycle][msg.sender] = 0;
        reservedForClaims = reservedForClaims.sub(payout);
    }

    function _updateStakerPoolOwnershipNextCycle(uint currentCycle, address staker, uint stakeValue) internal {
        uint nextCycle = currentCycle.add(1);
        uint currentStakerPoolOwnership = cycleStakerPoolOwnership[nextCycle][staker];
        cyclePoolTotal[nextCycle] = cyclePoolTotal[nextCycle].sub(currentStakerPoolOwnership).add(stakeValue);
        cycleStakerPoolOwnership[nextCycle][staker] = stakeValue;
    }

    function _updateStakerPoolOwnershipCurrentCycle(uint currentCycle, address staker, uint stakeValue) internal {
        uint currentStakerPoolOwnership = cycleStakerPoolOwnership[currentCycle][staker];
        if (stakeValue >= currentStakerPoolOwnership) return; //lowest balance is used
        cyclePoolTotal[currentCycle] = cyclePoolTotal[currentCycle].sub(currentStakerPoolOwnership).add(stakeValue);
        cycleStakerPoolOwnership[currentCycle][staker] = stakeValue;
    }
}
