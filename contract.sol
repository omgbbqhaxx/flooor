// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @dev Provides _msgSender()
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }
}

/// @dev Basic Ownable with onlyOwner modifier
contract Ownable is Context {
    address private _owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    constructor() {
        _owner = _msgSender();
        emit OwnershipTransferred(address(0), _owner);
    }
    modifier onlyOwner() {
        require(_msgSender() == _owner, "Ownable: caller is not owner");
        _;
    }
    function owner() public view returns (address) {
        return _owner;
    }
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is zero");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

/// @dev Prevents reentrant calls
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED     = 2;
    uint256 private _status;
    constructor() { _status = _NOT_ENTERED; }
    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

/// @dev Minimal ERC721 interface
interface IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner)     external view returns (uint256);
}

/// @title VRounsFloor
/// @notice Phased pool: sign → wait → claim, cycles begin on first sign; 1-based epochs
contract VRounsFloor is Ownable, ReentrancyGuard {
    IERC721 public constant nftCollection =
        IERC721(0x8f634c49BAC5b027FCa8482222421A4adC3F54ec);

    /// @notice Total ETH in the shared pool
    uint256 public poolBalance;
    /// @dev Timestamp when the very first sign occurred
    uint256 public startTimestamp;

    /// @dev Tracks last sign-epoch for each token (1-based epoch ID)
    mapping(uint256 => uint256) public lastRegisterEpoch;
    /// @dev Number of signers in each epoch
    mapping(uint256 => uint256) public participantsCount;
    /// @dev Tracks last claim-epoch for each token
    mapping(uint256 => uint256) public lastClaimEpoch;
    /// @dev Snapshot of poolBalance at start of each epoch
    mapping(uint256 => uint256) public epochPool;

    event PoolFunded(address indexed funder, uint256 amount);
    event Signed(address indexed user, uint256 indexed epoch, uint256 tokenId);
    event Claimed(address indexed user, uint256 indexed epoch, uint256 tokenId, uint256 reward);

    /// @notice Owner funds the shared pool with ETH
    function fundPool() external payable onlyOwner {
        require(msg.value > 0, "Must send ETH");
        poolBalance += msg.value;
        emit PoolFunded(_msgSender(), msg.value);
    }

    /// @dev Number of full 10-minute intervals since first sign
    function _intervalCount() internal view returns (uint256) {
        if (startTimestamp == 0) {
            return 0;
        }
        return (block.timestamp - startTimestamp) / 10 minutes;
    }

    /// @dev Compute 1-based epoch ID = floor(intervalCount/3) + 1
    function _getEpochId() internal view returns (uint256) {
        if (startTimestamp == 0) {
            return 0;
        }
        return (_intervalCount() / 3) + 1;
    }

    /// @notice Current phase: 0 = sign, 1 = wait, 2 = claim
    function currentPhase() public view returns (uint8) {
        // before first sign, always sign phase
        if (startTimestamp == 0) {
            return 0;
        }
        uint8 base = uint8(_intervalCount() % 3);
        uint256 e = _getEpochId();
        // if in wait/claim but no one signed this epoch, stay in sign
        if (base != 0 && participantsCount[e] == 0) {
            return 0;
        }
        return base;
    }

    /// @notice Seconds until the next phase begins
    function timeUntilNextPhase() external view returns (uint256) {
        uint256 start = startTimestamp == 0 ? block.timestamp : startTimestamp;
        uint256 idx   = startTimestamp == 0 ? 0 : _intervalCount();
        uint256 next  = start + (idx + 1) * 10 minutes;
        return next > block.timestamp ? next - block.timestamp : 0;
    }

    /// @notice Sign your single NFT to join the current epoch (phase 0 only)
    function sign(uint256 tokenId) external returns (bool) {
        require(currentPhase() == 0, "Sign only in phase 0");
        if (startTimestamp == 0) {
            // initialize on first sign
            startTimestamp = block.timestamp;
        }
        address sender = _msgSender();
        require(nftCollection.balanceOf(sender) == 1, "Must have exactly 1 NFT");
        require(nftCollection.ownerOf(tokenId) == sender, "Not owner");

        uint256 e = _getEpochId();
        require(lastRegisterEpoch[tokenId] < e, "Already signed");
        lastRegisterEpoch[tokenId] = e;
        participantsCount[e] += 1;
        emit Signed(sender, e, tokenId);
        return true;
    }

    /// @notice Claim your share of the pool if you signed this epoch (phase 2 only)
    function claim(uint256 tokenId) external nonReentrant returns (bool) {
        require(currentPhase() == 2, "Claim only in phase 2");
        address sender = _msgSender();
        require(nftCollection.balanceOf(sender) == 1, "Must have exactly 1 NFT");
        require(nftCollection.ownerOf(tokenId) == sender, "Not owner");

        uint256 e = _getEpochId();
        require(lastRegisterEpoch[tokenId] == e, "Not signed");
        require(lastClaimEpoch[tokenId] < e, "Already claimed");
        uint256 P = participantsCount[e];
        require(P > 0, "No participants");

        // snapshot pool balance at first claim
        if (epochPool[e] == 0) {
            epochPool[e] = poolBalance;
        }

        uint256 reward = epochPool[e] / P;
        poolBalance -= reward;
        lastClaimEpoch[tokenId] = e;
        emit Claimed(sender, e, tokenId, reward);

        (bool sent, ) = payable(sender).call{ value: reward }("");
        require(sent, "Transfer failed");
        return true;
    }
}