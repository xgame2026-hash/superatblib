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
}

contract SelfFundedAaveV3Liquidator {
  error OnlyOwner();
  error ZeroAddress();
  error ZeroAmount();
  error Reentrancy();
  error ReceiveATokenUnsupported();
  error MinCollateralNotMet(uint256 received, uint256 minimumExpected);
  error MinOutputNotMet(uint256 received, uint256 minimumExpected);
  error TokenCallFailed();
  error ExternalCallFailed();

  address public immutable owner;
  address public immutable pool;

  uint256 private _locked = 1;

  event LiquidationExecuted(
    address indexed user,
    address indexed collateralAsset,
    address indexed debtAsset,
    uint256 debtToCover,
    uint256 collateralReceived,
    uint256 debtRefund
  );
  event LiquidationSwapExecuted(
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
  )
    external
    onlyOwner
    nonReentrant
    returns (uint256 collateralReceived, uint256 debtRefund)
  {
    if (debtToCover == 0) revert ZeroAmount();
    if (receiveAToken) revert ReceiveATokenUnsupported();

    uint256 collateralBefore = _balanceOf(collateralAsset, address(this));

    _safeTransferFrom(debtAsset, msg.sender, address(this), debtToCover);
    _forceApprove(debtAsset, pool, debtToCover);

    IAaveV3PoolLike(pool).liquidationCall(
      collateralAsset,
      debtAsset,
      user,
      debtToCover,
      false
    );

    uint256 collateralAfter = _balanceOf(collateralAsset, address(this));
    uint256 debtAfter = _balanceOf(debtAsset, address(this));

    collateralReceived = collateralAfter - collateralBefore;
    if (collateralReceived < minCollateralReceived) {
      revert MinCollateralNotMet(collateralReceived, minCollateralReceived);
    }

    if (collateralAfter != 0) {
      _safeTransfer(collateralAsset, msg.sender, collateralAfter);
    }

    if (debtAfter != 0) {
      debtRefund = debtAfter;
      _safeTransfer(debtAsset, msg.sender, debtAfter);
    }

    emit LiquidationExecuted(
      user,
      collateralAsset,
      debtAsset,
      debtToCover,
      collateralReceived,
      debtRefund
    );
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
  )
    external
    onlyOwner
    nonReentrant
    returns (uint256 outputReceived, uint256 debtRefund, uint256 collateralDust)
  {
    if (swapTarget == address(0) || outputToken == address(0)) revert ZeroAddress();
    if (debtToCover == 0) revert ZeroAmount();

    address spender = allowanceTarget == address(0) ? swapTarget : allowanceTarget;

    uint256 collateralBefore = _balanceOf(collateralAsset, address(this));
    uint256 outputBefore = _balanceOf(outputToken, address(this));

    _safeTransferFrom(debtAsset, msg.sender, address(this), debtToCover);
    _forceApprove(debtAsset, pool, debtToCover);

    IAaveV3PoolLike(pool).liquidationCall(
      collateralAsset,
      debtAsset,
      user,
      debtToCover,
      false
    );

    uint256 collateralAfterLiquidation = _balanceOf(collateralAsset, address(this));
    uint256 debtAfterLiquidation = _balanceOf(debtAsset, address(this));
    uint256 collateralReceived = collateralAfterLiquidation - collateralBefore;

    if (collateralReceived < minCollateralReceived) {
      revert MinCollateralNotMet(collateralReceived, minCollateralReceived);
    }

    _forceApprove(collateralAsset, spender, collateralAfterLiquidation);
    (bool success, ) = swapTarget.call(swapCalldata);
    if (!success) revert ExternalCallFailed();
    _forceApprove(collateralAsset, spender, 0);

    uint256 collateralAfterSwap = _balanceOf(collateralAsset, address(this));
    uint256 outputAfterSwap = _balanceOf(outputToken, address(this));

    outputReceived = outputAfterSwap - outputBefore;
    if (outputReceived < minOutputAmount) {
      revert MinOutputNotMet(outputReceived, minOutputAmount);
    }

    collateralDust = collateralAfterSwap;
    if (collateralDust != 0) {
      _safeTransfer(collateralAsset, msg.sender, collateralDust);
    }

    if (outputToken == debtAsset) {
      uint256 totalDebtTokenBalance = _balanceOf(debtAsset, address(this));
      debtRefund = debtAfterLiquidation;
      if (totalDebtTokenBalance != 0) {
        _safeTransfer(debtAsset, msg.sender, totalDebtTokenBalance);
      }
    } else {
      if (debtAfterLiquidation != 0) {
        debtRefund = debtAfterLiquidation;
        _safeTransfer(debtAsset, msg.sender, debtAfterLiquidation);
      }

      if (outputAfterSwap != 0) {
        _safeTransfer(outputToken, msg.sender, outputAfterSwap);
      }
    }

    emit LiquidationExecuted(
      user,
      collateralAsset,
      debtAsset,
      debtToCover,
      collateralReceived,
      debtRefund
    );
    emit LiquidationSwapExecuted(
      user,
      collateralAsset,
      outputToken,
      collateralReceived - collateralDust,
      outputReceived
    );
  }

  function rescueToken(address token, address to, uint256 amount) external onlyOwner {
    if (to == address(0)) revert ZeroAddress();
    if (amount == 0) revert ZeroAmount();

    _safeTransfer(token, to, amount);
    emit TokenRescued(token, to, amount);
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

  function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
    (bool success, bytes memory data) = token.call(
      abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
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
