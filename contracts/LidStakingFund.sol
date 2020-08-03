pragma solidity 0.5.16;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./interfaces/ILidCertifiableToken.sol";


contract LidStakingFund is Initializable {
    using SafeMath for uint;

    ILidCertifiableToken private lidToken;
    address public authorizor;
    address public releaser;

    uint public totalLidAuthorized;
    uint public totalLidReleased;

    function initialize(
        address _authorizor,
        address _releaser,
        ILidCertifiableToken _lidToken
    ) external initializer {
        lidToken = _lidToken;
        authorizor = _authorizor;
        releaser = _releaser;
    }

    function() external payable { }

    function releaseLidToAddress(address receiver, uint amount) external returns(uint) {
        require(msg.sender == releaser, "Can only be called releaser.");
        require(amount <= totalLidAuthorized.sub(totalLidReleased), "Cannot release more Lid than available.");
        totalLidReleased = totalLidReleased.add(amount);
        lidToken.transfer(receiver, amount);
    }

    function authorizeLid(uint amount) external returns (uint) {
        require(msg.sender == authorizor, "Can only be called authorizor.");
        totalLidAuthorized = totalLidAuthorized.add(amount);
    }
}
