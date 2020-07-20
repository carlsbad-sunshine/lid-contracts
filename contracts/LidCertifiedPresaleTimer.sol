pragma solidity 0.5.16;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";


contract LidCertifiedPresaleTimer is Initializable, Ownable {
    using SafeMath for uint;

    uint public startTime;
    uint public baseTimer;
    uint public deltaTimer;

    function initialize(
        uint _startTime,
        uint _baseTimer,
        uint _deltaTimer,
        address owner
    ) external initializer {
        Ownable.initialize(msg.sender);
        startTime = _startTime;
        baseTimer = _baseTimer;
        deltaTimer = _deltaTimer;
        //Due to issue in oz testing suite, the msg.sender might not be owner
        _transferOwnership(owner);
    }

    function setStartTime(uint time) external onlyOwner {
        startTime = time;
    }

    function isStarted() external view returns (bool) {
        return (startTime != 0 && now > startTime);
    }

    function getEndTime(uint bal) external view returns (uint) {
        uint multiplier = 0;
        if (bal <= 1000 ether) {
            multiplier = bal.div(100 ether);
        } else if (bal <= 10000 ether) {
            multiplier = bal.div(1000 ether).add(9);
        } else if (bal <= 100000 ether) {
            multiplier = bal.div(10000 ether).add(19);
        } else if (bal <= 1000000 ether) {
            multiplier = bal.div(100000 ether).add(29);
        } else if (bal <= 10000000 ether) {
            multiplier = bal.div(1000000 ether).add(39);
        } else if (bal <= 100000000 ether) {
            multiplier = bal.div(10000000 ether).add(49);
        }
        return startTime.add(
            baseTimer
        ).add(
            deltaTimer.mul(multiplier)
        );
    }
}
