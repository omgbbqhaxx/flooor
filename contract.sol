// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721Like {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract flooordotfun {
    address public owner;
    modifier onlyOwner(){ require(msg.sender==owner,"owner"); _; }
    uint256 private  constant rBLOCKS   = 2 minutes; 
    uint256 private constant sDURTION = 1 minutes;
    address private constant collectionId = 0x8f634c49BAC5b027FCa8482222421A4adC3F54ec;
    IERC721Like private constant nft = IERC721Like(collectionId);


    modifier onlyNFTOwnerRead(uint256 tokenId, address useraddr) {
        require(nft.ownerOf(tokenId) == useraddr, "Not NFT owner");
        _;
    }

    modifier onlyNFTOwnerWrite(uint256 tokenId) {
        require(nft.ownerOf(tokenId) == msg.sender, "Not NFT owner");
        _;
    }
    

    function signorclaim(uint256 tokenId, address useraddr) public view onlyNFTOwnerRead(tokenId, useraddr) returns (uint256 secondsLeft, bool isSignPhase, string memory phaseName, uint256 btt, uint256 tid) {
        uint256 modTime = block.timestamp % rBLOCKS; 
        if (modTime < sDURTION) {
            return (sDURTION - modTime, false, "sign", block.timestamp, tokenId);
        } else {
            return (rBLOCKS - modTime, true, "claim", block.timestamp, tokenId);
        }
    }
 
}