// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721Like {
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
}

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint256 amount) external returns (bool);
}



contract flooordotfun {
    address payable private owner;
    bool private locked;
    address public immutable WETH;
    modifier onlyOwner(){ require(msg.sender==owner,"owner"); _; }
    uint256 public  constant rBLOCKS   = 2 minutes; 
    uint256 public constant sDURATION = 1 minutes;
    address public constant collectionId = 0x8f634c49BAC5b027FCa8482222421A4adC3F54ec;
    IERC721Like private constant nft = IERC721Like(collectionId);
    uint256 public minbidAM  =  10**8;
    uint256 public activebidAM;
    address public activeBidder;
    uint8 public minBidIncrementPercentage = 2;
    constructor(address _weth) { owner = payable(msg.sender);WETH = _weth; }
    event BidPlaced(address indexed bidder, uint256 amount, address indexed refunded, uint256 refundAmount);
    event SaleSettled(address indexed seller, address indexed buyer, uint256 indexed tokenId, uint256 amount);


    modifier nonReentrant() { 
        require(!locked, "Reentrancy"); 
        locked = true; 
        _; 
        locked = false; 
    }

    modifier onlyNFTOwnerRead(uint256 tokenId, address useraddr) {
        require(nft.ownerOf(tokenId) == useraddr, "Not owner of tokenId");
        require(nft.balanceOf(useraddr) == 1, "Must hold exactly 1 NFT");
        _;
    }

    modifier onlyNFTOwnerWrite(uint256 tokenId) {
        require(nft.ownerOf(tokenId) == msg.sender, "Not owner of tokenId");
        require(nft.balanceOf(msg.sender) == 1, "Must hold exactly 1 NFT");
        _;
    }


    function _safeTransferETHWithFallback(address to, uint256 amount) private {
        if (amount == 0 || to == address(0)) return;
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) {
            // ETH gönderilemediyse: WETH mint + transfer
            IWETH(WETH).deposit{value: amount}();
            bool ok = IWETH(WETH).transfer(to, amount);
            require(ok, "WETH transfer failed");
        }
    }


    function canClaim(uint256 tokenId, address useraddr) public view onlyNFTOwnerRead(tokenId, useraddr) returns (uint256 secondsLeft, bool canClaimNow, string memory phaseName, uint256 btt, uint256 tid) {
        uint256 modTime = block.timestamp % rBLOCKS; 
        if (modTime < sDURATION) {
            return (sDURATION - modTime, false, "sign", block.timestamp, tokenId);
        } else {
            return (rBLOCKS - modTime, true, "claim", block.timestamp, tokenId);
        }
    }

    receive() external payable nonReentrant {
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


function setMinBidIncrementPercentage(uint8 p) external onlyOwner {
    require(p <= 50, "too high"); 
    minBidIncrementPercentage = p;
}

function sellToHighest(uint256 tokenId) external nonReentrant onlyNFTOwnerWrite(tokenId) {
    // Geçerli bir en yüksek teklif olmalı
    require(activeBidder != address(0) && activebidAM >= minbidAM, "No active bid");

    // Bu kontratın token'ı transfer edebilmesi icin approval gerekli
    bool approved = (
        nft.getApproved(tokenId) == address(this) ||
        nft.isApprovedForAll(msg.sender, address(this))
    );
    require(approved, "Approve token to contract first");

    // Cache
    uint256 price = activebidAM;
    address buyer = activeBidder;
    address seller = msg.sender;

    // 1) NFT'yi aliciya gonder (external call)
    //    safeTransferFrom, alici kontratsa onERC721Received cagirtir
    nft.safeTransferFrom(seller, buyer, tokenId);

    // 2) Auction state'i sifirla (CEI: effects -> interactions)
    activebidAM  = 0;
    activeBidder = address(0);

    // 3) Saticiya odeme (ETH, basarisizsa WETH fallback)
    _safeTransferETHWithFallback(seller, price);

    emit SaleSettled(seller, buyer, tokenId, price);
}



 
}