// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract Context {
    function _msgSender() internal view virtual returns(address) {
        return msg.sender;
    }
}

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
    function owner() public view returns(address) {
        return _owner;
    }
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0), "Ownable: zero address");
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

abstract contract ReentrancyGuard {
    uint256 private _status;
    constructor() { _status = 1; }
    modifier nonReentrant() {
        require(_status == 1, "Reentrant");
        _status = 2;
        _;
        _status = 1;
    }
}

interface IERC721 {
    function transferFrom(address from,address to,uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns(address);
    function balanceOf(address owner) external view returns(uint256);
}

contract VRounsFloor is Ownable, ReentrancyGuard {
    IERC721 public immutable nftCollection;

    uint256 public poolBalance;
    uint256 public startTimestamp;
    mapping(uint256 => uint256) public lastRegisterEpoch;
    mapping(uint256 => uint256) public participantsCount;
    mapping(uint256 => uint256) public lastClaimEpoch;
    mapping(uint256 => uint256) public epochPool;

    struct Order { address owner; uint256 amount; bool active; }
    mapping(uint256 => Order) public orders;
    uint256[] public activeOrders;
    mapping(uint256 => uint256) public orderIndex;
    uint256 public nextOrderId;
    uint256 public lastOrderClearEpoch;

    uint256 public constant MAX_ORDERS = 5;

    event PoolFunded(address indexed funder, uint256 amount);
    event Signed(address indexed user, uint256 indexed epoch, uint256 tokenId);
    event Claimed(address indexed user, uint256 indexed epoch, uint256 tokenId, uint256 reward);
    event OrderPlaced(uint256 indexed orderId, address indexed owner, uint256 amount);
    event OrderCancelled(uint256 indexed orderId, address indexed owner);
    event OrdersCleared(uint256 indexed epoch);
    event SoldToFloor(address indexed seller, address indexed buyer, uint256 tokenId, uint256 amount);

    constructor(address _nftAddress) {
        nftCollection = IERC721(_nftAddress);
    }

    function _intervalCount() internal view returns(uint256) {
        if (startTimestamp == 0) return 0;
        return (block.timestamp - startTimestamp) / 2 minutes;
    }
    function _getEpochId() internal view returns(uint256) {
        if (startTimestamp == 0) return 0;
        return (_intervalCount() / 3) + 1;
    }
    function currentPhase() public view returns(uint8) {
        if (startTimestamp == 0) return 0;
        uint8 base = uint8(_intervalCount() % 3);
        uint256 e = _getEpochId();
        if (base != 0 && participantsCount[e] == 0) return 0;
        return base;
    }
    function timeUntilNextPhase() external view returns(uint256) {
        uint256 s = startTimestamp == 0 ? block.timestamp : startTimestamp;
        uint256 i = startTimestamp == 0 ? 0 : _intervalCount();
        uint256 n = s + (i + 1) * 2 minutes;
        return n > block.timestamp ? n - block.timestamp : 0;
    }

    function fundPool() external payable onlyOwner {
        require(msg.value > 0, "Must send ETH");
        poolBalance += msg.value;
        emit PoolFunded(_msgSender(), msg.value);
    }
    function sign(uint256 tokenId) external returns(bool) {
        require(currentPhase() == 0, "Sign only");
        if (startTimestamp == 0) startTimestamp = block.timestamp;
        address u = _msgSender();
        require(nftCollection.balanceOf(u) == 1, "Need 1 NFT");
        require(nftCollection.ownerOf(tokenId) == u, "Not owner");
        uint256 e = _getEpochId();
        require(lastRegisterEpoch[tokenId] < e, "Already signed");
        lastRegisterEpoch[tokenId] = e;
        participantsCount[e] += 1;
        emit Signed(u, e, tokenId);
        return true;
    }
    function claim(uint256 tokenId) external nonReentrant returns(bool) {
        require(currentPhase() == 2, "Claim only");
        address u = _msgSender();
        require(nftCollection.balanceOf(u) == 1, "Need 1 NFT");
        require(nftCollection.ownerOf(tokenId) == u, "Not owner");
        uint256 e = _getEpochId();
        require(lastRegisterEpoch[tokenId] == e, "Not signed");
        require(lastClaimEpoch[tokenId] < e, "Already claimed");
        uint256 P = participantsCount[e];
        require(P > 0, "No participants");
        if (epochPool[e] == 0) epochPool[e] = poolBalance;
        uint256 reward = epochPool[e] / P;
        poolBalance -= reward;
        lastClaimEpoch[tokenId] = e;
        emit Claimed(u, e, tokenId, reward);
        (bool sent,) = payable(u).call{ value: reward }("");
        require(sent, "Transfer failed");
        return true;
    }

    function clearOrders() public {
        require(currentPhase() == 0, "Clear only in sign phase");
        uint256 e = _getEpochId();
        require(lastOrderClearEpoch < e, "Already cleared");
        for (uint256 i = 0; i < activeOrders.length; i++) {
            orders[ activeOrders[i] ].active = false;
        }
        delete activeOrders;
        lastOrderClearEpoch = e;
        emit OrdersCleared(e);
    }

    function buyFloor() external payable nonReentrant returns(uint256 orderId) {
        require(msg.value >= 0.01 ether, "Minimum is 0.01 ETH");
        clearOrders();
        uint256 currentFloor = getFloorPrice();
        if (currentFloor > 0) {
            require(msg.value >= currentFloor + 0.01 ether, "Must outbid floor by +0.01 ETH");
        }
        if (activeOrders.length >= MAX_ORDERS) {
            uint256 oldest = activeOrders[0];
            Order storage old = orders[oldest];
            old.active = false;
            _removeActiveAt(0);
            payable(old.owner).transfer(old.amount);
            emit OrderCancelled(oldest, old.owner);
        }
        orderId = nextOrderId++;
        orders[orderId] = Order({ owner: _msgSender(), amount: msg.value, active: true });
        orderIndex[orderId] = activeOrders.length;
        activeOrders.push(orderId);
        emit OrderPlaced(orderId, _msgSender(), msg.value);
    }

    function sellToFloor(uint256 tokenId) external nonReentrant returns (bool) {
        require(activeOrders.length > 0, "No active orders");
        address seller = _msgSender();
        require(nftCollection.ownerOf(tokenId) == seller, "Not owner");

        uint256 bestOrderId;
        uint256 bestAmount;
        for (uint256 i = 0; i < activeOrders.length; i++) {
            uint256 id = activeOrders[i];
            uint256 amt = orders[id].amount;
            if (amt > bestAmount) {
                bestAmount = amt;
                bestOrderId = id;
            }
        }
        require(bestAmount > 0, "No valid bids");

        Order storage bestOrder = orders[bestOrderId];
        bestOrder.active = false;
        _removeActive(bestOrderId);

        nftCollection.transferFrom(seller, bestOrder.owner, tokenId);

        (bool sent,) = payable(seller).call{value: bestAmount}("");
        require(sent, "ETH send failed");

        emit SoldToFloor(seller, bestOrder.owner, tokenId, bestAmount);
        return true;
    }

    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        require(o.active, "Not active");
        require(o.owner == _msgSender(), "Not owner");
        o.active = false;
        _removeActive(orderId);
        uint256 amt = o.amount;
        o.amount = 0;
        payable(_msgSender()).transfer(amt);
        emit OrderCancelled(orderId, _msgSender());
    }

    function _removeActive(uint256 orderId) internal {
        uint256 idx = orderIndex[orderId];
        uint256 lastId = activeOrders[activeOrders.length - 1];
        activeOrders[idx] = lastId;
        orderIndex[lastId] = idx;
        activeOrders.pop();
        delete orderIndex[orderId];
    }

    function _removeActiveAt(uint256 idx) internal {
        uint256 removeId = activeOrders[idx];
        uint256 lastId = activeOrders[activeOrders.length - 1];
        activeOrders[idx] = lastId;
        orderIndex[lastId] = idx;
        activeOrders.pop();
        delete orderIndex[removeId];
    }

    function getActiveOrders() external view returns(uint256[] memory) {
        return activeOrders;
    }

    function getFloorPrice() public view returns(uint256 floor) {
        for (uint256 i = 0; i < activeOrders.length; i++) {
            uint256 amt = orders[ activeOrders[i] ].amount;
            if (amt > floor) floor = amt;
        }
    }
}