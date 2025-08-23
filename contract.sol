// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC721Like {
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
}

contract flooordotfun {
    address public owner;
    modifier onlyOwner(){ require(msg.sender==owner,"owner"); _; }
    uint256 private  constant rBLOCKS   = 2 minutes; 
    uint256 private constant sDURTION = 1 minutes;
    address private constant collectionId = 0x8f634c49BAC5b027FCa8482222421A4adC3F54ec;
    IERC721Like private constant nft = IERC721Like(collectionId);


     modifier onlyNFTOwnerRead(uint256 tokenId, address useraddr) {
        require(nft.ownerOf(tokenId) == useraddr, "Not owner of tokenId");
        require(nft.balanceOf(useraddr) == 1, "Must hold exactly 1 NFT");
        _;
    }

    // WRITE: çağıran adres o tokenId'nin sahibi OLMALI
    // ve koleksiyondan TAM 1 adet NFT tutmalı
    modifier onlyNFTOwnerWrite(uint256 tokenId) {
        require(nft.ownerOf(tokenId) == msg.sender, "Not owner of tokenId");
        require(nft.balanceOf(msg.sender) == 1, "Must hold exactly 1 NFT");
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