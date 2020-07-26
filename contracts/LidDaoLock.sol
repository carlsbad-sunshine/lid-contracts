pragma solidity 0.5.16;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "./interfaces/ILidCertifiableToken.sol";
import "./library/BasisPoints.sol";


contract LidDaoLock is Initializable, Ownable {
    using BasisPoints for uint;
    using SafeMath for uint;

    uint public releaseInterval;
    uint public releaseStart;
    uint public releaseBP;

    uint public startingLid;
    uint public claimedLid;

    ILidCertifiableToken private lidToken;

    address daoWallet;

    modifier onlyAfterStart {
        require(releaseStart != 0 && now > releaseStart, "Has not yet started.");
        _;
    }

    function initialize(
        uint _releaseInterval,
        uint _releaseBP,
        address owner,
        ILidCertifiableToken _lidToken
    ) external initializer {
        releaseInterval = _releaseInterval;
        releaseBP = _releaseBP;
        lidToken = _lidToken;

        Ownable.initialize(msg.sender);

        //Due to issue in oz testing suite, the msg.sender might not be owner
        _transferOwnership(owner);
    }

    function claimLid() external onlyAfterStart {
        require(releaseStart != 0, "Has not yet started.");
        uint cycle = getCurrentCycleCount();
        uint totalClaimAmount = cycle.mul(startingLid.mulBP(releaseBP));
        uint toClaim = totalClaimAmount.sub(claimedLid);
        if (lidToken.balanceOf(address(this)) < toClaim) toClaim = lidToken.balanceOf(address(this));
        claimedLid = claimedLid.add(toClaim);
        lidToken.transfer(daoWallet, toClaim);
    }

    function startRelease(address _daoWallet) external onlyOwner {
        require(releaseStart == 0, "Has already started.");
        require(lidToken.balanceOf(address(this)) != 0, "Must have some lid deposited.");
        daoWallet = _daoWallet;
        startingLid = lidToken.balanceOf(address(this));
        releaseStart = now.add(24 hours);
    }

    function getCurrentCycleCount() public view returns (uint) {
        if (now <= releaseStart) return 0;
        return now.sub(releaseStart).div(releaseInterval).add(1);
    }

}
