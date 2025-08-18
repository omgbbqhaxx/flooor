// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract flooordotfun {
    address public owner;
    modifier onlyOwner(){ require(msg.sender==owner,"owner"); _; }
    //uint256 public plusone;
    uint256 private  constant BLOCK   = 6 minutes; 
    uint256 private constant SIGN_DURATION = 4 minutes; 

    //function incrase() public {
    //    plusone = plusone + 1;
   // }

    function signorclaim() public view returns (uint256 secondsLeft, bool isSignPhase, string memory phaseName, uint256 btt) {
        uint256 modTime = block.timestamp % 360; // 2 dk döngü
        if (modTime < 60) {
            return (60 - modTime, false, "sign", block.timestamp);
        } else {
            // you can claim right now claim mode : true
            return (360 - modTime, true, "claim", block.timestamp);
        }
    }
 
}