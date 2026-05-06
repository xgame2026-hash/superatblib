// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
  function balanceOf(address account) external view returns (uint256);
}

interface IAaveV3PoolLike {
  function liquidationCall(
    address collateralAsset,
    address debtAsset,
    address user,
    uint256 debtToCover,
    bool receiveAToken
  ) external;

  function flashLoanSimple(
    address receiverAddress,
    address asset,
    uint256 amount,
    bytes calldata params,
    uint16 referralCode
  ) external;
}

contract FlashLoanAaveV3Liquidator {
  error OnlyOwner();
  error OnlyPool();
  error InvalidInitiator();
  error InvalidAsset();
  error ZeroAddress();
  error ZeroAmount();
  error Reentrancy();
  error ReceiveATokenUnsupported();
  error SwapRequired();
  error MinCollateralNotMet(uint256 received, uint256 minimumExpected);
  error MinOutputNotMet(uint256 received, uint256 minimumExpected);
  error InsufficientRepayment(uint256 available, uint256 requiredAmount);
  error TokenCallFailed();
  error ExternalCallFailed();

  struct FlashLoanParams {
    address collateralAsset;
    address debtAsset;
    address user;
    uint256 debtToCover;
    uint256 minCollateralReceived;
    address swapTarget;
    address allowanceTarget;
    address outputToken;
    uint256 minOutputAmount;
    bytes swapCalldata;
  }

  address public immutable owner;
  address public immutable pool;

  uint256 private _locked = 1;

  event FlashLoanLiquidationExecuted(
    address indexed user,
    address indexed collateralAsset,
    address indexed debtAsset,
    uint256 debtToCover,
    uint256 premium,
    uint256 collateralReceived,
    uint256 debtProfit
  );

  event FlashLoanSwapExecuted(
    address indexed user,
    address indexed collateralAsset,
    address indexed outputToken,
    uint256 collateralSpent,
    uint256 outputReceived
  );

  event TokenRescued(address indexed token, address indexed to, uint256 amount);

  modifier onlyOwner() {
    if (msg.sender != owner) revert OnlyOwner();
    _;
  }

  modifier nonReentrant() {
    if (_locked != 1) revert Reentrancy();
    _locked = 2;
    _;
    _locked = 1;
  }

  constructor(address owner_, address pool_) {
    if (owner_ == address(0) || pool_ == address(0)) revert ZeroAddress();
    owner = owner_;
    pool = pool_;
  }

  function executeLiquidation(
    address collateralAsset,
    address debtAsset,
    address user,
    uint256 debtToCover,
    uint256 minCollateralReceived,
    bool receiveAToken
  ) external onlyOwner nonReentrant returns (uint256 collateralReceived, uint256 debtProfit) {
    if (debtToCover == 0) revert ZeroAmount();
    if (receiveAToken) revert ReceiveATokenUnsupported();
    if (collateralAsset != debtAsset) revert SwapRequired();

    IAaveV3PoolLike(pool).flashLoanSimple(
      address(this),
      debtAsset,
      debtToCover,
      abi.encode(
        FlashLoanParams({
          collateralAsset: collateralAsset,
          debtAsset: debtAsset,
          user: user,
          debtToCover: debtToCover,
          minCollateralReceived: minCollateralReceived,
          swapTarget: address(0),
          allowanceTarget: address(0),
          outputToken: address(0),
          minOutputAmount: 0,
          swapCalldata: bytes("")
        })
      ),
      0
    );

    collateralReceived = _flushToken(collateralAsset, owner);
    if (debtAsset != collateralAsset) {
      debtProfit = _flushToken(debtAsset, owner);
    }
  }

  function executeLiquidationAndSwap(
    address collateralAsset,
    address debtAsset,
    address user,
    uint256 debtToCover,
    uint256 minCollateralReceived,
    address swapTarget,
    address allowanceTarget,
    address outputToken,
    uint256 minOutputAmount,
    bytes calldata swapCalldata
  ) external onlyOwner nonReentrant returns (uint256 outputReceived, uint256 debtProfit, uint256 collateralDust) {
    if (swapTarget == address(0) || outputToken == address(0)) revert ZeroAddress();
    if (debtToCover == 0) revert ZeroAmount();

    IAaveV3PoolLike(pool).flashLoanSimple(
      address(this),
      debtAsset,
      debtToCover,
      abi.encode(
        FlashLoanParams({
          collateralAsset: collateralAsset,
          debtAsset: debtAsset,
          user: user,
          debtToCover: debtToCover,
          minCollateralReceived: minCollateralReceived,
          swapTarget: swapTarget,
          allowanceTarget: allowanceTarget,
          outputToken: outputToken,
          minOutputAmount: minOutputAmount,
          swapCalldata: swapCalldata
        })
      ),
      0
    );

    collateralDust = _flushToken(collateralAsset, owner);
    outputReceived = _flushToken(outputToken, owner);

    if (debtAsset != outputToken && debtAsset != collateralAsset) {
      debtProfit = _flushToken(debtAsset, owner);
    } else if (debtAsset == outputToken) {
      debtProfit = outputReceived;
    } else if (debtAsset == collateralAsset) {
      debtProfit = collateralDust;
    }
  }

  function executeOperation(
    address asset,
    uint256 amount,
    uint256 premium,
    address initiator,
    bytes calldata params
  ) external returns (bool) {
    if (msg.sender != pool) revert OnlyPool();
    if (initiator != address(this)) revert InvalidInitiator();

    FlashLoanParams memory decoded = abi.decode(params, (FlashLoanParams));
    if (asset != decoded.debtAsset) revert InvalidAsset();

    uint256 collateralBefore = _balanceOf(decoded.collateralAsset, address(this));
    uint256 outputBefore =
      decoded.outputToken == address(0) ? 0 : _balanceOf(decoded.outputToken, address(this));

    _forceApprove(decoded.debtAsset, pool, amount);
    IAaveV3PoolLike(pool).liquidationCall(
      decoded.collateralAsset,
      decoded.debtAsset,
      decoded.user,
      amount,
      false
    );

    uint256 collateralAfterLiquidation = _balanceOf(decoded.collateralAsset, address(this));
    uint256 collateralReceived = collateralAfterLiquidation - collateralBefore;
    if (collateralReceived < decoded.minCollateralReceived) {
      revert MinCollateralNotMet(collateralReceived, decoded.minCollateralReceived);
    }

    if (decoded.swapTarget == address(0)) {
      if (decoded.collateralAsset != decoded.debtAsset) revert SwapRequired();
    } else {
      address spender =
        decoded.allowanceTarget == address(0) ? decoded.swapTarget : decoded.allowanceTarget;
      _forceApprove(decoded.collateralAsset, spender, collateralAfterLiquidation);
      (bool success, ) = decoded.swapTarget.call(decoded.swapCalldata);
      if (!success) revert ExternalCallFailed();
      _forceApprove(decoded.collateralAsset, spender, 0);

      uint256 outputAfterSwap = _balanceOf(decoded.outputToken, address(this));
      uint256 outputReceived = outputAfterSwap - outputBefore;
      if (outputReceived < decoded.minOutputAmount) {
        revert MinOutputNotMet(outputReceived, decoded.minOutputAmount);
      }

      emit FlashLoanSwapExecuted(
        decoded.user,
        decoded.collateralAsset,
        decoded.outputToken,
        collateralReceived - _balanceOf(decoded.collateralAsset, address(this)),
        outputReceived
      );
    }

    uint256 amountOwed = amount + premium;
    uint256 debtBalance = _balanceOf(decoded.debtAsset, address(this));
    if (debtBalance < amountOwed) {
      revert InsufficientRepayment(debtBalance, amountOwed);
    }

    _forceApprove(decoded.debtAsset, pool, amountOwed);

    emit FlashLoanLiquidationExecuted(
      decoded.user,
      decoded.collateralAsset,
      decoded.debtAsset,
      amount,
      premium,
      collateralReceived,
      debtBalance - amountOwed
    );

    return true;
  }

  function rescueToken(address token, address to, uint256 amount) external onlyOwner {
    if (to == address(0)) revert ZeroAddress();
    if (amount == 0) revert ZeroAmount();

    _safeTransfer(token, to, amount);
    emit TokenRescued(token, to, amount);
  }

  function _flushToken(address token, address to) private returns (uint256 amount) {
    if (token == address(0)) {
      return 0;
    }

    amount = _balanceOf(token, address(this));
    if (amount != 0) {
      _safeTransfer(token, to, amount);
    }
  }

  function _balanceOf(address token, address account) private view returns (uint256) {
    return IERC20Minimal(token).balanceOf(account);
  }

  function _safeTransfer(address token, address to, uint256 amount) private {
    (bool success, bytes memory data) = token.call(
      abi.encodeWithSignature("transfer(address,uint256)", to, amount)
    );
    if (!success || (data.length != 0 && !abi.decode(data, (bool)))) {
      revert TokenCallFailed();
    }
  }

  function _safeApprove(address token, address spender, uint256 amount) private returns (bool) {
    (bool success, bytes memory data) = token.call(
      abi.encodeWithSignature("approve(address,uint256)", spender, amount)
    );

    return success && (data.length == 0 || abi.decode(data, (bool)));
  }

  function _forceApprove(address token, address spender, uint256 amount) private {
    if (_safeApprove(token, spender, amount)) {
      return;
    }

    if (!_safeApprove(token, spender, 0)) revert TokenCallFailed();
    if (!_safeApprove(token, spender, amount)) revert TokenCallFailed();
  }
}
