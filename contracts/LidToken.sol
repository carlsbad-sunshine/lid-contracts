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
import "./interfaces/ILidCertifiableToken.sol";
import "./LidStaking.sol";
import "./LidCertifiedPresale.sol";


contract LidToken is
    Initializable,
    ILidCertifiableToken,
    ERC20Burnable,
    ERC20Mintable,
    ERC20Pausable,
    ERC20Detailed,
    Ownable {
    using BasisPoints for uint;
    using SafeMath for uint;

    uint public taxBP;
    uint public daoTaxBP;
    address private daoFund;
    LidStaking private lidStaking;
    LidCertifiedPresale private lidPresale;

    bool public isTaxActive;
    bool public isTransfersActive;

    mapping(address => bool) private trustedContracts;
    mapping(address => bool) public taxExempt;
    mapping(address => bool) public fromOnlyTaxExempt;
    mapping(address => bool) public toOnlyTaxExempt;

    string private _name;

    modifier onlyPresaleContract() {
        require(msg.sender == address(lidPresale), "Can only be called by presale sc.");
        _;
    }

    function initialize(
        string calldata name, string calldata symbol, uint8 decimals,
        address owner, uint _taxBP, uint _daoTaxBP,
        address _daoFund,
        LidStaking _lidStaking,
        LidCertifiedPresale _lidPresale
    ) external initializer {
        taxBP = _taxBP;
        daoTaxBP = _daoTaxBP;

        Ownable.initialize(msg.sender);

        ERC20Detailed.initialize(name, symbol, decimals);

        ERC20Mintable.initialize(address(this));
        _removeMinter(address(this));
        _addMinter(owner);

        ERC20Pausable.initialize(address(this));
        _removePauser(address(this));
        _addPauser(owner);

        daoFund = _daoFund;
        lidStaking = _lidStaking;
        addTrustedContract(address(_lidStaking));
        addTrustedContract(address(_lidPresale));
        setTaxExemptStatus(address(_lidStaking), true);
        setTaxExemptStatus(address(_lidPresale), true);
        //Due to issue in oz testing suite, the msg.sender might not be owner
        _transferOwnership(owner);
    }

    function setFromOnlyTaxExemptStatus(address account, bool status) external onlyOwner {
        fromOnlyTaxExempt[account] = status;
    }

    function setToOnlyTaxExemptStatus(address account, bool status) external onlyOwner {
        fromOnlyTaxExempt[account] = status;
    }

    function removeTrustedContract(address contractAddress) external onlyOwner {
        trustedContracts[contractAddress] = false;
    }

    function activateTransfers() external onlyPresaleContract {
        isTransfersActive = true;
    }

    function setIsTaxActive(bool status) external onlyOwner {
        isTaxActive = status;
    }

    function setIsTransfersActive(bool status) external onlyOwner {
        isTransfersActive = status;
    }

    function activateTax() external onlyPresaleContract {
        isTaxActive = true;
    }

    function updateName(string calldata value) external onlyOwner {
        _name = value;
    }

    function name() public view returns (string memory) {
        return _name;
    }

    function transfer(address recipient, uint amount) public returns (bool) {
        require(isTransfersActive, "Transfers are currently locked.");
        (
            isTaxActive &&
            !taxExempt[msg.sender] && !taxExempt[recipient] &&
            !toOnlyTaxExempt[recipient] && !fromOnlyTaxExempt[msg.sender]
        ) ?
            _transferWithTax(msg.sender, recipient, amount) :
            _transfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint amount) public returns (bool) {
        require(isTransfersActive, "Transfers are currently locked.");
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

    function addTrustedContract(address contractAddress) public onlyOwner {
        trustedContracts[contractAddress] = true;
    }

    function setTaxExemptStatus(address account, bool status) public onlyOwner {
        taxExempt[account] = status;
    }

    function findTaxAmount(uint value) public view returns (uint tax, uint daoTax) {
        tax = value.mulBP(taxBP);
        daoTax = value.mulBP(daoTaxBP);
    }

    function _transferWithTax(address sender, address recipient, uint amount) internal {
        require(sender != address(0), "ERC20: transfer from the zero address");
        require(recipient != address(0), "ERC20: transfer to the zero address");

        (uint tax, uint daoTax) = findTaxAmount(amount);
        uint tokensToTransfer = amount.sub(tax).sub(daoTax);

        _transfer(sender, address(lidStaking), tax);
        _transfer(sender, address(daoFund), daoTax);
        _transfer(sender, recipient, tokensToTransfer);
        lidStaking.handleTaxDistribution(tax);
    }
}
