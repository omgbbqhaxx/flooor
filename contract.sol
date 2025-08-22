// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract flooordotfun {
    address public owner;
    modifier onlyOwner(){ require(msg.sender==owner,"owner"); _; }
    uint256 private  constant rBLOCKS   = 2 minutes; 
    uint256 private constant sDURTION = 1 minutes; 


    

    function signorclaim() public view returns (uint256 secondsLeft, bool isSignPhase, string memory phaseName, uint256 btt) {
        uint256 modTime = block.timestamp % rBLOCKS; 
        if (modTime < sDURTION) {
            return (sDURTION - modTime, false, "sign", block.timestamp);
        } else {
            return (rBLOCKS - modTime, true, "claim", block.timestamp);
        }
    }
 
}