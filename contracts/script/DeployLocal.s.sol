// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { MockQUSDC } from "../src/MockQUSDC.sol";
import { ServiceEscrow } from "../src/ServiceEscrow.sol";

/// @notice Local test deploy for the anvil e2e: MockQUSDC + ServiceEscrow.
/// Uses the well-known anvil accounts: operator/deployer = account 0,
/// customer = account 1, treasury = account 2. Test only — never mainnet.
/// Run: forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545
///   --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast
contract DeployLocal is Script {
    function run() external {
        address operator = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
        address customer = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address treasury = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        vm.startBroadcast();
        MockQUSDC token = new MockQUSDC();
        token.mint(customer, 10_000_000_000); // 10,000 QUSDC (6 decimals)
        ServiceEscrow escrow = new ServiceEscrow(address(token), treasury, operator);
        vm.stopBroadcast();
        console.log("QUSDC");
        console.log(address(token));
        console.log("ESCROW");
        console.log(address(escrow));
        console.log("TREASURY");
        console.log(treasury);
        console.log("OPERATOR");
        console.log(operator);
        console.log("CUSTOMER");
        console.log(customer);
    }
}
