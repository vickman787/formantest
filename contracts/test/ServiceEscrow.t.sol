// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { Test } from "forge-std/Test.sol";
import { ServiceEscrow } from "../src/ServiceEscrow.sol";
import { MockQUSDC } from "../src/MockQUSDC.sol";

contract ServiceEscrowTest is Test {
    ServiceEscrow escrow;
    MockQUSDC token;
    address operator = address(0xA11CE);
    address treasury = address(0x7EA5);
    address customer = address(0xC057);
    address stranger = address(0x57A6);
    uint256 constant PRICE = 1_000_000; // 1 QUSDC, 6 decimals
    bytes32 jobId = keccak256("job-1");

    uint64 fundDeadline;
    uint64 deliveryDeadline;
    uint64 reviewDeadline;

    function setUp() public {
        token = new MockQUSDC();
        escrow = new ServiceEscrow(address(token), treasury, operator);
        fundDeadline = uint64(block.timestamp + 30 minutes);
        deliveryDeadline = uint64(block.timestamp + 24 hours);
        reviewDeadline = uint64(block.timestamp + 24 hours + 48 hours);
        token.mint(customer, 10 * PRICE);
        vm.prank(customer);
        token.approve(address(escrow), type(uint256).max);
    }

    function create() internal {
        vm.prank(operator);
        escrow.createJob(jobId, customer, PRICE, fundDeadline, deliveryDeadline, reviewDeadline);
    }

    function fund() internal {
        create();
        vm.prank(customer);
        escrow.fundJob(jobId);
    }

    function deliver() internal {
        fund();
        vm.prank(operator);
        escrow.submitDelivery(jobId, keccak256("manifest"));
    }

    function testHappyPathAcceptReleasesOnce() public {
        deliver();
        uint256 before = token.balanceOf(treasury);
        vm.prank(customer);
        escrow.acceptDelivery(jobId);
        assertEq(token.balanceOf(treasury) - before, PRICE);
        assertEq(token.balanceOf(address(escrow)), 0);
        // Second accept must fail.
        vm.prank(customer);
        vm.expectRevert(ServiceEscrow.WrongState.selector);
        escrow.acceptDelivery(jobId);
    }

    function testOnlyCustomerCanFundAndAccept() public {
        create();
        vm.prank(stranger);
        vm.expectRevert(ServiceEscrow.NotCustomer.selector);
        escrow.fundJob(jobId);
        vm.prank(customer);
        escrow.fundJob(jobId);
        vm.prank(operator);
        escrow.submitDelivery(jobId, keccak256("m"));
        vm.prank(stranger);
        vm.expectRevert(ServiceEscrow.NotCustomer.selector);
        escrow.acceptDelivery(jobId);
    }

    function testWrongAmountOrWrongJobCannotFund() public {
        // Funding an unknown job reverts.
        vm.prank(customer);
        vm.expectRevert(ServiceEscrow.UnknownJob.selector);
        escrow.fundJob(keccak256("nope"));
        // Delivery cannot precede funding.
        create();
        vm.prank(operator);
        vm.expectRevert(ServiceEscrow.WrongState.selector);
        escrow.submitDelivery(jobId, keccak256("m"));
    }

    function testOperatorRefundBeforeSettlement() public {
        fund();
        uint256 before = token.balanceOf(customer);
        vm.prank(operator);
        escrow.refundJob(jobId);
        assertEq(token.balanceOf(customer) - before, PRICE);
        // No second refund.
        vm.prank(operator);
        vm.expectRevert(ServiceEscrow.WrongState.selector);
        escrow.refundJob(jobId);
    }

    function testLateRefundAfterMissedDelivery() public {
        fund();
        vm.warp(deliveryDeadline + 1);
        uint256 before = token.balanceOf(customer);
        vm.prank(customer);
        escrow.claimLateRefund(jobId);
        assertEq(token.balanceOf(customer) - before, PRICE);
    }

    function testLateRefundTooEarly() public {
        fund();
        vm.prank(customer);
        vm.expectRevert(ServiceEscrow.TooEarly.selector);
        escrow.claimLateRefund(jobId);
    }

    function testReviewReleaseGoesToTreasuryNotCaller() public {
        deliver();
        vm.warp(reviewDeadline + 1);
        uint256 before = token.balanceOf(treasury);
        uint256 callerBefore = token.balanceOf(stranger);
        vm.prank(stranger);
        escrow.claimReviewRelease(jobId);
        assertEq(token.balanceOf(treasury) - before, PRICE);
        assertEq(token.balanceOf(stranger), callerBefore);
    }

    function testReviewReleaseTooEarly() public {
        deliver();
        vm.prank(stranger);
        vm.expectRevert(ServiceEscrow.TooEarly.selector);
        escrow.claimReviewRelease(jobId);
    }

    function testFundAfterDeadline() public {
        create();
        vm.warp(fundDeadline + 1);
        vm.prank(customer);
        vm.expectRevert(ServiceEscrow.DeadlinePassed.selector);
        escrow.fundJob(jobId);
    }

    function testOnlyOperatorCreatesAndSubmits() public {
        vm.prank(stranger);
        vm.expectRevert(ServiceEscrow.NotOperator.selector);
        escrow.createJob(jobId, customer, PRICE, fundDeadline, deliveryDeadline, reviewDeadline);
        fund();
        vm.prank(stranger);
        vm.expectRevert(ServiceEscrow.NotOperator.selector);
        escrow.submitDelivery(jobId, keccak256("m"));
    }

    function testDuplicateJobIdRejected() public {
        create();
        vm.prank(operator);
        vm.expectRevert(ServiceEscrow.WrongState.selector);
        escrow.createJob(jobId, customer, PRICE, fundDeadline, deliveryDeadline, reviewDeadline);
    }
}
