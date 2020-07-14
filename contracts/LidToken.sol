pragma solidity 0.5.16;
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Detailed.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Mintable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Pausable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/upgrades/contracts/Initializable.sol";
import "./library/BasisPoints.sol";
import "./LidStaking.sol";


contract LidToken is Initializable, ERC20Burnable, ERC20Mintable, ERC20Pausable, ERC20Detailed, Ownable {
    using BasisPoints for uint;
    using SafeMath for uint;

    uint public taxBP;
    bool public isTaxActive;
    LidStaking private lidStaking;
    mapping(address => bool) private trustedContracts;
    mapping(address => bool) public taxExempt;
    mapping(address => bool) public fromOnlyTaxExempt;
    mapping(address => bool) public toOnlyTaxExempt;

    function initialize(
        string memory name, string memory symbol, uint8 decimals,
        address owner, uint _taxBP, LidStaking _lidStaking
    ) public initializer {
        taxBP = _taxBP;

        isTaxActive = false;

        Ownable.initialize(msg.sender);

        ERC20Detailed.initialize(name, symbol, decimals);

        ERC20Mintable.initialize(address(this));
        _removeMinter(address(this));
        _addMinter(owner);

        ERC20Pausable.initialize(address(this));
        _removePauser(address(this));
        _addPauser(owner);

        lidStaking = _lidStaking;
        addTrustedContract(address(_lidStaking));
        setTaxExemptStatus(address(_lidStaking));
        //Due to issue in oz testing suite, the msg.sender might not be owner
        _transferOwnership(owner);
    }

    function setTaxExemptStatus(address account, bool status) public onlyOwner {
        taxExempt[account] = status;
    }

    function setFromOnlyTaxExemptStatus(address account, bool status) public onlyOwner {
        fromOnlyTaxExempt[account] = status;
    }

    function setToOnlyTaxExemptStatus(address account, bool status) public onlyOwner {
        fromOnlyTaxExempt[account] = status;
    }

    function findTaxAmount(uint value) public view returns (uint) {
        return value.mulBP(taxBP);
    }

    function transfer(address recipient, uint256 amount) public returns (bool) {
        (
            isTaxActive &&
            !taxExempt[msg.sender] && !taxExempt[recipient] &&
            !toOnlyTaxExempt[recipient] && !fromOnlyTaxExempt[msg.sender]
        ) ?
            _transferWithTax(msg.sender, recipient, amount) :
            _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public returns (bool) {
        (
            isTaxActive &&
            !taxExempt[sender] && !taxExempt[recipient] &&
            !toOnlyTaxExempt[recipient] && !fromOnlyTaxExempt[sender]
        ) ?
            _transferWithTax(sender, recipient, amount) :
            _transfer(sender, recipient, amount);
        if (trustedContracts[msg.sender]) return true;
        approve
        (
            msg.sender,
            allowance(
                sender,
                msg.sender
            ).sub(amount, "Transfer amount exceeds allowance")
        );
        return true;
    }

    function setTaxRate(uint valueBP) public onlyOwner {
        require(valueBP < 10000, "Tax connot be over 100% (10000 BP)");
        taxBP = valueBP;
    }

    function setIsTaxActive(bool value) public onlyOwner {
        isTaxActive = value;
    }

    function addTrustedContract(address contractAddress) public onlyOwner {
        trustedContracts[contractAddress] = true;
    }

    function removeTrustedContract(address contractAddress) public onlyOwner {
        trustedContracts[contractAddress] = false;
    }

    function _transferWithTax(address sender, address recipient, uint256 amount) internal {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        uint256 tokensToTax = findTaxAmount(amount);
        uint256 tokensToTransfer = amount.sub(tokensToTax);

        _transfer(sender, address(lidStaking), tokensToTax);
        _transfer(sender, recipient, tokensToTransfer);
        lidStaking.handleTaxDistribution(tokensToTax);
    }
}
