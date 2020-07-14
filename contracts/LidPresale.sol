pragma solidity 0.5.16;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Mintable.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./uniswapV2Periphery/interfaces/IUniswapV2Router01.sol";
import "./library/BasisPoints.sol";

contract LidPresale is Initializable, Ownable {
    using BasisPoints for uint;
    using SafeMath for uint;

    uint public maxBuyPerAddress;

    uint public maximumPresaleEther;
    uint public totalPresaleEther;

    uint public totalPresaleTokens;
    uint public totalUniswapTokens;

    uint public etherPoolDevfund;
    uint public etherPoolBuyback;
    uint public etherPoolUniswap;

    uint private buybackBP;
    uint private devfundBP;

    uint public startTime;
    uint public endTime;

    bool public isClosedByOwner;
    bool public requiresWhitelisting;
    bool public hasSentToUniswap;

    ERC20Mintable private lidToken;
    IUniswapV2Router01 private uniswapRouter;

    mapping(address => uint) public depositAccounts;
    mapping(address => bool) public whitelist;

    modifier whenPresaleActive {
        require(startTime != 0 && now > startTime, "Presale not yet started.");
        require(!_isPresaleEnded(), "Presale has ended.");
        _;
    }

    modifier whenPresaleFinished {
        require(startTime != 0 && now > startTime, "Presale not yet started.");
        require(_isPresaleEnded(), "Presale has not yet ended.");
        _;
    }

    modifier whenSentToUniswap {
        require(hasSentToUniswap, "Ether must be sent to Uniswap first.");
        _;
    }

    function initialize(
        uint _buybackBP,
        uint _devfundBP,
        uint _maxBuyPerAddress,
        uint _maximumPresaleEther,
        bool _requiresWhitelisting,
        uint _totalPresaleTokens,
        uint _totalUniswapTokens,
        address owner,
        ERC20Mintable _lidToken
    ) public initializer {
        Ownable.initialize(msg.sender);

        buybackBP = _buybackBP;
        devfundBP = _devfundBP;
        lidToken = _lidToken;
        maxBuyPerAddress = _maxBuyPerAddress;
        maximumPresaleEther = _maximumPresaleEther;
        requiresWhitelisting = _requiresWhitelisting;
        totalPresaleTokens = _totalPresaleTokens;
        totalUniswapTokens = _totalUniswapTokens;

        isClosedByOwner = false;
        hasSentToUniswap = false;

        uniswapRouter = IUniswapV2Router01(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

        require(lidToken.balanceOf(address(this)) == totalPresaleTokens.add(totalUniswapTokens));
        lidToken.approve(address(uniswapRouter), totalUniswapTokens);

        //Due to issue in oz testing suite, the msg.sender might not be owner
        _transferOwnership(owner);
    }

    function deposit() public payable whenPresaleActive {
        if (requiresWhitelisting) {
            require(whitelist[msg.sender], "Address is not whitelisted for this private presale.");
        }
        require(
            depositAccounts[msg.sender].add(msg.value) <= maxBuyPerAddress,
            "Deposit exceeds max buy per address."
        );
        require(totalPresaleEther.add(msg.value) <= maximumPresaleEther, "Purchase exceeds presale maximum.");
        require(msg.value > 0, "Must purchase at least 1 wei.");

        uint etherForDevfund = msg.value.mulBP(devfundBP);
        uint etherForBuyback = msg.value.mulBP(buybackBP);
        uint etherForUniswap = msg.value.sub(etherForDevfund).sub(etherForBuyback);

        etherPoolDevfund = etherPoolDevfund.add(etherForDevfund);
        etherPoolBuyback = etherPoolBuyback.add(etherForBuyback);
        etherPoolUniswap = etherPoolUniswap.add(etherForUniswap);

        totalPresaleEther = totalPresaleEther.add(msg.value);

        depositAccounts[msg.sender] = depositAccounts[msg.sender].add(msg.value);
    }

    function redeem() public whenPresaleFinished whenSentToUniswap {
        require(depositAccounts[msg.sender] > 0, "No redemption available.");
        uint amount = depositAccounts[msg.sender].mul(calculateRate());
        depositAccounts[msg.sender] = 0;
        lidToken.transfer(msg.sender, amount);
    }

    function sendToUniswap() public whenPresaleFinished {
        require(etherPoolUniswap > 0, "No ether to send.");
        (uint amountToken, uint amountETH, ) = uniswapRouter.addLiquidityETH.value(etherPoolUniswap)(
            address(lidToken),
            totalUniswapTokens,
            totalUniswapTokens,
            etherPoolUniswap,
            address(this),
            now.add(3600)
        );
        hasSentToUniswap = true;
        etherPoolUniswap = etherPoolUniswap.sub(amountETH);
        totalUniswapTokens = totalUniswapTokens.sub(amountToken);
    }

    function withdrawFromDevfund(uint amount, address payable receiver) public
        onlyOwner whenPresaleFinished whenSentToUniswap
    {
        require(amount <= etherPoolDevfund, "Amount exceeds pool.");
        etherPoolDevfund = etherPoolDevfund.sub(amount);
        receiver.transfer(amount);
    }

    function withdrawFromBuyback(uint amount, address payable receiver) public
        onlyOwner whenPresaleFinished whenSentToUniswap
    {
        require(amount <= etherPoolBuyback, "Amount exceeds pool.");
        etherPoolBuyback = etherPoolBuyback.sub(amount);
        receiver.transfer(amount);
    }

    function setIsClosedByOwner(bool value) public onlyOwner {
        isClosedByOwner = value;
    }

    function setRequiresWhitelisting(bool value) public onlyOwner {
        requiresWhitelisting = value;
    }

    function setHasSentToUniswap(bool value) public onlyOwner {
        hasSentToUniswap = value;
    }

    function setWhitelist(address account, bool value) public onlyOwner {
        whitelist[account] = value;
    }

    function setWhitelistForAll(address[] memory account, bool value) public onlyOwner {
        for (uint i=0; i < account.length; i++) {
            whitelist[account[i]] = value;
        }
    }

    function setStartTime(uint time) public onlyOwner {
        startTime = time;
    }

    function setEndTime(uint time) public onlyOwner {
        endTime = time;
    }

    function calculateRate() public view returns (uint) {
        return totalPresaleTokens.div(totalPresaleEther);
    }

    function _isPresaleEnded() internal view returns (bool) {
        if (startTime == 0 || now < startTime) return false;
        return (
            totalPresaleEther >= maximumPresaleEther ||
            isClosedByOwner ||
            (endTime != 0 && now > endTime)
        );
    }

}
