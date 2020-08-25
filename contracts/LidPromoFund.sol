pragma solidity 0.5.16;

import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./interfaces/ILidCertifiableToken.sol";


contract LidPromoFund is Initializable {
    using SafeMath for uint;

    ILidCertifiableToken private lidToken;
    address public authorizor;
    address public releaser;

    uint public totalLidAuthorized;
    uint public totalLidReleased;

    uint public totalEthAuthorized;
    uint public totalEthReleased;

    mapping(address => bool) authorizors;

    mapping(address => bool) releasers;

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
        require(msg.sender == releaser || releasers[msg.sender], "Can only be called releaser.");
        require(amount <= totalLidAuthorized.sub(totalLidReleased), "Cannot release more Lid than available.");
        totalLidReleased = totalLidReleased.add(amount);
        lidToken.transfer(receiver, amount);
    }

    function authorizeLid(uint amount) external returns (uint) {
        require(msg.sender == authorizor || authorizors[msg.sender], "Can only be called authorizor.");
        totalLidAuthorized = totalLidAuthorized.add(amount);
    }

    function releaseEthToAddress(address payable receiver, uint amount) external returns(uint) {
        require(msg.sender == releaser || releasers[msg.sender], "Can only be called releaser.");
        require(amount <= totalEthAuthorized.sub(totalEthReleased), "Cannot release more Eth than available.");
        totalEthReleased = totalEthReleased.add(amount);
        receiver.transfer(amount);
    }

    function authorizeEth(uint amount) external returns (uint) {
        require(msg.sender == authorizor || authorizors[msg.sender], "Can only be called authorizor.");
        totalEthAuthorized = totalEthAuthorized.add(amount);
    }

    function setAuthorizorStatus(address _authorizor, bool _isAuthorized) external {
        require(msg.sender == authorizor || authorizors[msg.sender], "Can only be called authorizor.");
        authorizors[_authorizor] = _isAuthorized;
    }

    function setReleaserStatus(address _releaser, bool _isAuthorized) external {
        require(msg.sender == releaser || releasers[msg.sender], "Can only be called authorizor.");
        releasers[_releaser] = _isAuthorized;
    }
}
