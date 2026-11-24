// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Forma ServiceEscrow
/// @notice Minimal escrow for one fixed-price creative service (1 QUSDC).
/// The settlement asset and the treasury are immutable. No swaps, no
/// upgrades, no per-agent wallets, no yield. Delivery must precede release;
/// a missed delivery deadline can be refunded by the customer; the review
/// window release goes to the fixed treasury, never to the caller.
contract ServiceEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset; // QUSDC
    address public immutable treasury;
    address public immutable operator;

    enum Status { Open, Funded, Delivered, Released, Refunded }

    struct Job {
        address customer;
        uint256 amount;
        Status status;
        bytes32 manifestHash;
        uint64 fundDeadline;
        uint64 deliveryDeadline;
        uint64 reviewDeadline;
    }

    mapping(bytes32 => Job) public jobs;

    event JobCreated(bytes32 indexed jobId, address indexed customer, uint256 amount);
    event JobFunded(bytes32 indexed jobId, address indexed customer, uint256 amount);
    event DeliverySubmitted(bytes32 indexed jobId, bytes32 manifestHash);
    event DeliveryAccepted(bytes32 indexed jobId, address indexed customer, uint256 amount);
    event JobRefunded(bytes32 indexed jobId, address indexed customer, uint256 amount);

    error NotOperator();
    error NotCustomer();
    error UnknownJob();
    error WrongState();
    error WrongAmount();
    error DeadlinePassed();
    error TooEarly();

    constructor(address asset_, address treasury_, address operator_) {
        asset = IERC20(asset_);
        treasury = treasury_;
        operator = operator_;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    /// @notice Bind a unique job id to a customer, amount and deadlines.
    function createJob(
        bytes32 jobId,
        address customer,
        uint256 amount,
        uint64 fundDeadline,
        uint64 deliveryDeadline,
        uint64 reviewDeadline
    ) external onlyOperator {
        if (jobs[jobId].customer != address(0)) revert WrongState();
        if (amount == 0 || customer == address(0)) revert WrongAmount();
        if (fundDeadline <= block.timestamp || deliveryDeadline <= fundDeadline || reviewDeadline <= deliveryDeadline) {
            revert DeadlinePassed();
        }
        jobs[jobId] = Job({
            customer: customer,
            amount: amount,
            status: Status.Open,
            manifestHash: bytes32(0),
            fundDeadline: fundDeadline,
            deliveryDeadline: deliveryDeadline,
            reviewDeadline: reviewDeadline
        });
        emit JobCreated(jobId, customer, amount);
    }

    /// @notice The recorded customer funds exactly the quoted amount.
    function fundJob(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.customer == address(0)) revert UnknownJob();
        if (job.status != Status.Open) revert WrongState();
        if (msg.sender != job.customer) revert NotCustomer();
        if (block.timestamp > job.fundDeadline) revert DeadlinePassed();
        job.status = Status.Funded;
        asset.safeTransferFrom(msg.sender, address(this), job.amount);
        emit JobFunded(jobId, msg.sender, job.amount);
    }

    /// @notice Operator records the immutable delivery manifest hash.
    function submitDelivery(bytes32 jobId, bytes32 manifestHash) external onlyOperator {
        Job storage job = jobs[jobId];
        if (job.customer == address(0)) revert UnknownJob();
        if (job.status != Status.Funded) revert WrongState();
        if (block.timestamp > job.deliveryDeadline) revert DeadlinePassed();
        job.status = Status.Delivered;
        job.manifestHash = manifestHash;
        emit DeliverySubmitted(jobId, manifestHash);
    }

    /// @notice The recorded customer accepts; the fixed amount goes to the
    /// fixed treasury exactly once.
    function acceptDelivery(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.customer == address(0)) revert UnknownJob();
        if (job.status != Status.Delivered) revert WrongState();
        if (msg.sender != job.customer) revert NotCustomer();
        job.status = Status.Released;
        asset.safeTransfer(treasury, job.amount);
        emit DeliveryAccepted(jobId, msg.sender, job.amount);
    }

    /// @notice Operator refund for a genuine failure, funded or delivered only.
    function refundJob(bytes32 jobId) external onlyOperator nonReentrant {
        Job storage job = jobs[jobId];
        if (job.customer == address(0)) revert UnknownJob();
        if (job.status != Status.Funded && job.status != Status.Delivered) revert WrongState();
        job.status = Status.Refunded;
        asset.safeTransfer(job.customer, job.amount);
        emit JobRefunded(jobId, job.customer, job.amount);
    }

    /// @notice Customer refund after a missed delivery deadline.
    function claimLateRefund(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.customer == address(0)) revert UnknownJob();
        if (job.status != Status.Funded) revert WrongState();
        if (msg.sender != job.customer) revert NotCustomer();
        if (block.timestamp <= job.deliveryDeadline) revert TooEarly();
        job.status = Status.Refunded;
        asset.safeTransfer(job.customer, job.amount);
        emit JobRefunded(jobId, job.customer, job.amount);
    }

    /// @notice Anyone may trigger the review-window release to the treasury.
    /// The caller never receives the funds.
    function claimReviewRelease(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (job.customer == address(0)) revert UnknownJob();
        if (job.status != Status.Delivered) revert WrongState();
        if (block.timestamp <= job.reviewDeadline) revert TooEarly();
        job.status = Status.Released;
        asset.safeTransfer(treasury, job.amount);
        emit DeliveryAccepted(jobId, job.customer, job.amount);
    }

    function getJob(bytes32 jobId)
        external
        view
        returns (
            address customer,
            uint256 amount,
            Status status,
            bytes32 manifestHash,
            uint64 fundDeadline,
            uint64 deliveryDeadline,
            uint64 reviewDeadline
        )
    {
        Job storage job = jobs[jobId];
        return (
            job.customer,
            job.amount,
            job.status,
            job.manifestHash,
            job.fundDeadline,
            job.deliveryDeadline,
            job.reviewDeadline
        );
    }
}
