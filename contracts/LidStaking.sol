pragma solidity 0.5.16;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./library/BasisPoints.sol";
import "./interfaces/IStakeHandler.sol";
import "./interfaces/ILidCertifiableToken.sol";


contract LidStaking is Initializable, Ownable {
    using BasisPoints for uint;
    using SafeMath for uint;

    uint256 constant internal DISTRIBUTION_MULTIPLIER = 2 ** 64;

    uint public stakingTaxBP;
    uint public unstakingTaxBP;
    ILidCertifiableToken private lidToken;

    mapping(address => uint) public stakeValue;
    mapping(address => int) private stakerPayouts;

    uint public totalDistributions;
    uint public totalStaked;
    uint public totalStakers;
    uint private profitPerShare;
    uint private emptyStakeTokens; //These are tokens given to the contract when there are no stakers.

    IStakeHandler[] public stakeHandlers;
    uint public startTime;

    event OnDistribute(address sender, uint amountSent);
    event OnStake(address sender, uint amount, uint tax);
    event OnUnstake(address sender, uint amount, uint tax);
    event OnReinvest(address sender, uint amount, uint tax);
    event OnWithdraw(address sender, uint amount);

    modifier onlyLidToken {
        require(msg.sender == address(lidToken), "Can only be called by LidToken contract.");
        _;
    }

    modifier whenStakingActive {
        require(startTime != 0 && now > startTime, "Staking not yet started.");
        _;
    }

    function initialize(
        uint _stakingTaxBP,
        uint _ustakingTaxBP,
        address owner,
        ILidCertifiableToken _lidToken
    ) public initializer {
        Ownable.initialize(msg.sender);
        stakingTaxBP = _stakingTaxBP;
        unstakingTaxBP = _ustakingTaxBP;
        lidToken = _lidToken;
        //Due to issue in oz testing suite, the msg.sender might not be owner
        _transferOwnership(owner);
    }

    function stake(uint amount) public whenStakingActive {
        require(amount >= 1e18, "Must stake at least one LID.");
        require(lidToken.balanceOf(msg.sender) >= amount, "Cannot stake more LID than you hold unstaked.");
        if (stakeValue[msg.sender] == 0) totalStakers = totalStakers.add(1);
        uint tax = _addStake(amount);
        require(lidToken.transferFrom(msg.sender, address(this), amount), "Stake failed due to failed transfer.");
        emit OnStake(msg.sender, amount, tax);
    }

    function unstake(uint amount) public whenStakingActive {
        require(amount >= 1e18, "Must unstake at least one LID.");
        require(stakeValue[msg.sender] >= amount, "Cannot unstake more LID than you have staked.");
        uint tax = findTaxAmount(amount, unstakingTaxBP);
        uint earnings = amount.sub(tax);
        if (stakeValue[msg.sender] == amount) totalStakers = totalStakers.sub(1);
        totalStaked = totalStaked.sub(amount);
        stakeValue[msg.sender] = stakeValue[msg.sender].sub(amount);
        uint payout = profitPerShare.mul(amount).add(tax.mul(DISTRIBUTION_MULTIPLIER));
        stakerPayouts[msg.sender] = stakerPayouts[msg.sender] - uintToInt(payout);
        for (uint i=0; i < stakeHandlers.length; i++) {
            stakeHandlers[i].handleUnstake(msg.sender, amount, stakeValue[msg.sender]);
        }
        _increaseProfitPerShare(tax);
        require(lidToken.transferFrom(address(this), msg.sender, earnings), "Unstake failed due to failed transfer.");
        emit OnUnstake(msg.sender, amount, tax);
    }

    function withdraw(uint amount) public whenStakingActive {
        require(dividendsOf(msg.sender) >= amount, "Cannot withdraw more dividends than you have earned.");
        stakerPayouts[msg.sender] = stakerPayouts[msg.sender] + uintToInt(amount.mul(DISTRIBUTION_MULTIPLIER));
        lidToken.transfer(msg.sender, amount);
        emit OnWithdraw(msg.sender, amount);
    }

    function reinvest(uint amount) public whenStakingActive {
        require(dividendsOf(msg.sender) >= amount, "Cannot reinvest more dividends than you have earned.");
        uint payout = amount.mul(DISTRIBUTION_MULTIPLIER);
        stakerPayouts[msg.sender] = stakerPayouts[msg.sender] + uintToInt(payout);
        uint tax = _addStake(amount);
        emit OnReinvest(msg.sender, amount, tax);
    }

    function distribute(uint amount) public {
        require(lidToken.balanceOf(msg.sender) >= amount, "Cannot distribute more LID than you hold unstaked.");
        totalDistributions = totalDistributions.add(amount);
        _increaseProfitPerShare(amount);
        require(
            lidToken.transferFrom(msg.sender, address(this), amount),
            "Distribution failed due to failed transfer."
        );
        emit OnDistribute(msg.sender, amount);
    }

    function handleTaxDistribution(uint amount) public onlyLidToken {
        totalDistributions = totalDistributions.add(amount);
        _increaseProfitPerShare(amount);
        emit OnDistribute(msg.sender, amount);
    }

    function dividendsOf(address staker) public view returns (uint) {
        return uint(uintToInt(profitPerShare.mul(stakeValue[staker])) - stakerPayouts[staker])
            .div(DISTRIBUTION_MULTIPLIER);
    }

    function findTaxAmount(uint value, uint taxBP) public pure returns (uint) {
        return value.mulBP(taxBP);
    }

    function numberStakeHandlersRegistered() public view returns (uint) {
        return stakeHandlers.length;
    }

    function registerStakeHandler(IStakeHandler sc) public onlyOwner {
        stakeHandlers.push(sc);
    }

    function unregisterStakeHandler(uint index) public onlyOwner {
        IStakeHandler sc = stakeHandlers[stakeHandlers.length-1];
        stakeHandlers.pop();
        stakeHandlers[index] = sc;
    }

    function setStakingBP(uint valueBP) public onlyOwner {
        require(valueBP < 10000, "Tax connot be over 100% (10000 BP)");
        stakingTaxBP = valueBP;
    }

    function setUnstakingBP(uint valueBP) public onlyOwner {
        require(valueBP < 10000, "Tax connot be over 100% (10000 BP)");
        unstakingTaxBP = valueBP;
    }

    function setStartTime(uint _startTime) public onlyOwner {
        startTime = _startTime;
    }

    function uintToInt(uint val) internal pure returns (int) {
        if (val >= uint(-1).div(2)) {
            require(false, "Overflow. Cannot convert uint to int.");
        } else {
            return int(val);
        }
    }

    function _addStake(uint amount) internal returns (uint tax) {
        tax = findTaxAmount(amount, stakingTaxBP);
        uint stakeAmount = amount.sub(tax);
        totalStaked = totalStaked.add(stakeAmount);
        stakeValue[msg.sender] = stakeValue[msg.sender].add(stakeAmount);
        for (uint i=0; i < stakeHandlers.length; i++) {
            stakeHandlers[i].handleStake(msg.sender, stakeAmount, stakeValue[msg.sender]);
        }
        uint payout = profitPerShare.mul(stakeAmount);
        stakerPayouts[msg.sender] = stakerPayouts[msg.sender] + uintToInt(payout);
        _increaseProfitPerShare(tax);
    }

    function _increaseProfitPerShare(uint amount) internal {
        if (totalStaked != 0) {
            if (emptyStakeTokens != 0) {
                amount = amount.add(emptyStakeTokens);
                emptyStakeTokens = 0;
            }
            profitPerShare = profitPerShare.add(amount.mul(DISTRIBUTION_MULTIPLIER).div(totalStaked));
        } else {
            emptyStakeTokens = emptyStakeTokens.add(amount);
        }
    }

}
