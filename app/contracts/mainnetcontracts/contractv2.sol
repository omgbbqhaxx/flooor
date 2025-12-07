// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721Like {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
}

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint256 amount) external returns (bool);
}

contract flooordotfunTheWarplets {
    address payable private owner;
    bool private locked;
    address public immutable WETH;

    modifier onlyOwner(){ require(msg.sender==owner,"owner"); _; }

    uint256 public  constant rBLOCKS   = 1440 minutes; 
    uint256 public constant sDURATION  = 960 minutes;  

    address public constant collectionId = 0x699727F9E01A822EFdcf7333073f0461e5914b4E;
    IERC721Like private constant nft = IERC721Like(collectionId);

    uint256 public minbidAM  = 10**8;
    uint256 public activebidAM;
    address public activeBidder;
    uint8 public minBidIncrementPercentage = 2;

    uint256 public poolAccrued;

    uint256 public epochId;                               
    mapping(uint256 => uint256) public epochStartById;     

    // ---- SIGN / CLAIM artık TOKEN BAZLI ----
    mapping(bytes32 => bool) private _signedTok;     // ("T",epochStart,tokenId)
    mapping(bytes32 => bool) private _claimedTok;    // ("C",epochStart,tokenId)

    mapping(uint256 => uint256) public partCount;
    mapping(uint256 => uint256) public poolSnap;
    mapping(uint256 => uint256) public claimedCount;

    uint256 private lastEpochRoll;

    constructor(address _weth) { owner = payable(msg.sender); WETH = _weth; }

    event BidPlaced(address indexed bidder, uint256 amount, address indexed refunded, uint256 refundAmount);
    event SaleSettled(address indexed seller, address indexed buyer, uint256 indexed tokenId, uint256 amount);
    event Staked(address indexed user, uint256 indexed tokenId, uint256 epochStart);
    event Claimed(address indexed user, uint256 epochStart, uint256 share);

    modifier nonReentrant() {
        require(!locked, "Reentrancy");
        locked = true;
        _;
        locked = false;
    }

    modifier onlyNFTOwner(uint256 tokenId) {
        require(nft.ownerOf(tokenId) == msg.sender, "Not owner of tokenId");
        _;
    }

    function _safeTransferETHWithFallback(address to, uint256 amount) private {
        if (amount == 0 || to == address(0)) return;
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) {
            IWETH(WETH).deposit{value: amount}();
            bool ok = IWETH(WETH).transfer(to, amount);
            require(ok, "WETH transfer failed");
        }
    }

    // -------------------------------------------------------------
    // SIGN / CLAIM (NFT-BAZLI)
    // -------------------------------------------------------------
    function signOrClaim(uint256 tokenId) external nonReentrant onlyNFTOwner(tokenId) {
        uint256 modTime    = block.timestamp % rBLOCKS;
        uint256 epochStart = block.timestamp - modTime;

        // epoch rollover
        if (modTime < sDURATION && epochStart > lastEpochRoll) {
            if (lastEpochRoll != 0 && poolSnap[lastEpochRoll] > 0 && partCount[lastEpochRoll] > 0) {
                uint256 perShare    = poolSnap[lastEpochRoll] / partCount[lastEpochRoll];
                uint256 distributed = perShare * claimedCount[lastEpochRoll];
                uint256 leftover    = poolSnap[lastEpochRoll] - distributed;
                if (leftover > 0) {
                    poolAccrued += leftover;
                }
            }
            lastEpochRoll = epochStart;

            epochStartById[epochId] = epochStart;
            epochId += 1;
        }

        bytes32 kTok = keccak256(abi.encodePacked("T", epochStart, tokenId));
        bytes32 kClm = keccak256(abi.encodePacked("C", epochStart, tokenId));

        // --------------- SIGN ---------------
        if (modTime < sDURATION) {
            require(!_signedTok[kTok], "already signed");

            _signedTok[kTok] = true;
            partCount[epochStart] += 1;

            emit Staked(msg.sender, tokenId, epochStart);
            return;
        }

        // --------------- CLAIM ---------------
        if (poolSnap[epochStart] == 0 && partCount[epochStart] > 0 && poolAccrued > 0) {
            poolSnap[epochStart] = poolAccrued;
            poolAccrued = 0;
        }

        require(_signedTok[kTok], "not signed");
        require(!_claimedTok[kClm], "already claimed");

        uint256 n = partCount[epochStart];
        require(n > 0, "no participants");

        uint256 share = poolSnap[epochStart] / n;
        require(share > 0, "zero share");

        _claimedTok[kClm] = true;
        claimedCount[epochStart] += 1;

        _safeTransferETHWithFallback(msg.sender, share);

        emit Claimed(msg.sender, epochStart, share);
    }

    // -------------------------------------------------------------
    // NEW VIEW FUNCTIONS (Sen istedin)
    // -------------------------------------------------------------

    function isSigned(uint256 epochStart, uint256 tokenId) external view returns (bool) {
        bytes32 k = keccak256(abi.encodePacked("T", epochStart, tokenId));
        return _signedTok[k];
    }

    function isClaimed(uint256 epochStart, uint256 tokenId) external view returns (bool) {
        bytes32 k = keccak256(abi.encodePacked("C", epochStart, tokenId));
        return _claimedTok[k];
    }

    fallback() external payable { revert("Use receive()"); }

    function placeBid() external payable nonReentrant {
        require(msg.sender != owner, "Owner cannot bid");
        require(
            msg.value >= (
                activebidAM == 0
                    ? minbidAM
                    : activebidAM + (activebidAM * minBidIncrementPercentage) / 100
            ),
            "Bid too low"
        );

        uint256 prevAmt = activebidAM;
        address prevBidder = activeBidder;

        activebidAM  = msg.value;
        activeBidder = msg.sender;

        if (prevBidder != address(0) && prevAmt != 0) {
            _safeTransferETHWithFallback(prevBidder, prevAmt);
        }

        emit BidPlaced(msg.sender, msg.value, prevBidder, prevAmt);
    }

    function sellToHighest(uint256 tokenId) 
        external 
        nonReentrant 
        onlyNFTOwner(tokenId)
    {
        require(activeBidder != address(0) && activebidAM >= minbidAM, "No active bid");
        require(activeBidder != msg.sender, "You cannot sell to yourself");

        bool approved = (
            nft.getApproved(tokenId) == address(this) ||
            nft.isApprovedForAll(msg.sender, address(this))
        );
        require(approved, "Approve token to contract first");

        uint256 price  = activebidAM;
        address buyer  = activeBidder;
        address seller = msg.sender;

        uint256 fee = (price * 500) / 10_000;    
        uint256 platformCut = fee / 10;          
        uint256 poolCut     = fee - platformCut; 
        uint256 sellerPayout = price - fee;      

        nft.safeTransferFrom(seller, buyer, tokenId);

        activebidAM  = 0;
        activeBidder = address(0);

        _safeTransferETHWithFallback(seller, sellerPayout);
        if (platformCut > 0) {
            _safeTransferETHWithFallback(owner, platformCut);
        }
        poolAccrued += poolCut;

        emit SaleSettled(seller, buyer, tokenId, price);
    }

    function setMinBidIncrementPercentage(uint8 p) external onlyOwner {
        require(p <= 50, "too high");
        minBidIncrementPercentage = p;
    }

    function sweepERC20(address token, uint256 amt) external onlyOwner nonReentrant {
        require(token != address(0), "zero token");
        require(amt > 0, "zero amount");

        uint256 bal = IERC20Minimal(token).balanceOf(address(this));
        require(bal >= amt, "insufficient token balance");

        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Minimal.transfer.selector, owner, amt));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "sweep fail");
    }

    function sweepETH(uint256 amt) external onlyOwner {
        (bool ok, ) = owner.call{value: amt}("");
        require(ok, "sweep fail");
    }

    function setMinBidAmount(uint256 newMin) external onlyOwner {
        require(newMin > 0, "min bid must be > 0");
        minbidAM = newMin;
    }

    function currentEpochStart() public view returns (uint256) {
        uint256 modTime = block.timestamp % rBLOCKS;
        return block.timestamp - modTime;
    }
}