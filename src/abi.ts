import { parseAbi, parseAbiItem } from "viem";

export const addressProviderAbi = parseAbi([
  "function getPool() view returns (address)",
  "function getMarketId() view returns (string)",
  "function getPriceOracle() view returns (address)",
  "function getPoolDataProvider() view returns (address)",
]);

export const poolAbi = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
  "function getUserEMode(address user) view returns (uint256)",
  "function getEModeCategoryData(uint8 id) view returns ((uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus, address priceSource, string label))",
  "function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken)",
  "function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes params, uint16 referralCode)",
  "function FLASHLOAN_PREMIUM_TOTAL() view returns (uint128)",
]);

export const oracleAbi = parseAbi([
  "function BASE_CURRENCY() view returns (address)",
  "function BASE_CURRENCY_UNIT() view returns (uint256)",
  "function getAssetPrice(address asset) view returns (uint256)",
]);

export const poolDataProviderAbi = parseAbi([
  "function getAllReservesTokens() view returns ((string symbol, address tokenAddress)[])",
  "function getReserveConfigurationData(address asset) view returns (uint256 decimals, uint256 ltv, uint256 liquidationThreshold, uint256 liquidationBonus, uint256 reserveFactor, bool usageAsCollateralEnabled, bool borrowingEnabled, bool stableBorrowRateEnabled, bool isActive, bool isFrozen)",
  "function getReserveEModeCategory(address asset) view returns (uint256)",
  "function getLiquidationProtocolFee(address asset) view returns (uint256)",
  "function getUserReserveData(address asset, address user) view returns (uint256 currentATokenBalance, uint256 currentStableDebt, uint256 currentVariableDebt, uint256 principalStableDebt, uint256 scaledVariableDebt, uint256 stableBorrowRate, uint256 liquidityRate, uint40 stableRateLastUpdated, bool usageAsCollateralEnabled)",
]);

export const poolEvents = [
  parseAbiItem(
    "event Supply(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint16 indexed referralCode)",
  ),
  parseAbiItem(
    "event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount)",
  ),
  parseAbiItem(
    "event Borrow(address indexed reserve, address user, address indexed onBehalfOf, uint256 amount, uint8 interestRateMode, uint256 borrowRate, uint16 indexed referralCode)",
  ),
  parseAbiItem(
    "event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount, bool useATokens)",
  ),
  parseAbiItem(
    "event LiquidationCall(address indexed collateralAsset, address indexed debtAsset, address indexed user, uint256 debtToCover, uint256 liquidatedCollateralAmount, address liquidator, bool receiveAToken)",
  ),
  parseAbiItem(
    "event ReserveUsedAsCollateralEnabled(address indexed reserve, address indexed user)",
  ),
  parseAbiItem(
    "event ReserveUsedAsCollateralDisabled(address indexed reserve, address indexed user)",
  ),
  parseAbiItem("event UserEModeSet(address indexed user, uint8 categoryId)"),
] as const;
