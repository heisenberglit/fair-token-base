// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockOracle {
    uint256 private _price;

    event PriceUpdated(uint256 newPrice);

    function setPrice(uint256 newPrice) external {
        _price = newPrice;
        emit PriceUpdated(newPrice);
    }

    function getPrice() external view returns (uint256) {
        return _price;
    }
}