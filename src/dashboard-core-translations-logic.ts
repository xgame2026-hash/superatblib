export const DASHBOARD_CORE_TRANSLATIONS_LOGIC = String.raw`
      function applyOverviewTranslations() {
        text('overviewHubTitle', t('overviewHubTitle'));
        text('overviewHubInfo', t('overviewHubInfo'));
        text('overviewSurfacesTitle', t('overviewSurfacesTitle'));
        text('overviewSurfacesInfo', t('overviewSurfacesInfo'));
        text('overviewLiquidationSnapshotTitle', t('overviewLiquidationSnapshotTitle'));
        text('overviewLiquidationSnapshotInfo', t('overviewLiquidationSnapshotInfo'));
        text('overviewFlashloanSnapshotTitle', t('overviewFlashloanSnapshotTitle'));
        text('overviewFlashloanSnapshotInfo', t('overviewFlashloanSnapshotInfo'));

        text('summaryTitle', t('summaryTitle'));
        text('summarySub', t('summarySub'));
        text('summaryInfo', t('summaryInfo'));
        text('trendTitle', t('trendTitle'));
        text('trendSub', t('trendSub'));
        text('trendInfo', t('trendInfo'));
        text('distributionTitle', t('distributionTitle'));
        text('distributionSub', t('distributionSub'));
        text('distributionInfo', t('distributionInfo'));
        text('distributionFootnote', t('distributionFootnote'));
        text('latestLiquidationTitle', t('latestLiquidationTitle'));
        text('latestLiquidationInfo', t('latestLiquidationInfo'));
        text('latestLiquidationDatePlaceholder', t('latestLiquidationPickDate'));
        text('latestLiquidationItemsPerPageLabel', t('latestLiquidationItemsPerPage'));
        text('latestLiquidationUnitQuantity', t('latestLiquidationQuantity'));
        text('latestLiquidationUnitUsd', t('latestLiquidationUsd'));
        text('leaderboardTitle', t('leaderboardTitle'));
        text('leaderboardInfo', t('leaderboardInfo'));
        text('leaderboardLatestTitle', t('leaderboardLatestTitle'));
        text('leaderboardLatestInfo', t('leaderboardLatestInfo'));
        text('protocolsTitle', t('protocolsTitle'));
        text('protocolsSub', t('protocolsSub'));
        text('protocolsInfo', t('protocolsInfo'));
        text('strategyMarketsTitle', t('strategyMarketsTitle'));
        text('strategyMarketsSub', t('strategyMarketsSub'));
        text('strategyMarketsInfo', t('strategyMarketsInfo'));
        text('flashloanSummaryTitle', t('flashloanSummaryTitle'));
        text('flashloanSummaryInfo', t('flashloanSummaryInfo'));
        text('flashloanTrendTitle', t('flashloanTrendTitle'));
        text('flashloanTrendInfo', t('flashloanTrendInfo'));
        text('flashloanLatestTitle', t('flashloanLatestTitle'));
        text('flashloanLatestInfo', t('flashloanLatestInfo'));
        text('flashloanLatestSub', t('flashloanLatestSub'));
        text('flashloanTopTitle', t('flashloanTopTitle'));
        text('flashloanTopInfo', t('flashloanTopInfo'));
        text('flashloanTopSub', t('flashloanTopSub'));
        text('flashloanProtocolsTitle', t('flashloanProtocolsTitle'));
        text('flashloanProtocolsInfo', t('flashloanProtocolsInfo'));
        text('flashloanProtocolsSub', t('flashloanProtocolsSub'));

        const leaderboardTabs = t('leaderboardTabs');
        const leaderboardTabInfo = t('leaderboardTabInfo');
        setButtonLabelPreserveChildren('leaderboardTabTxProfit', leaderboardTabs[0]);
        setButtonLabelPreserveChildren('leaderboardTabLiquidations', leaderboardTabs[1]);
        setButtonLabelPreserveChildren('leaderboardTabLiquidators', leaderboardTabs[2]);
        setButtonLabelPreserveChildren('leaderboardTabAssets', leaderboardTabs[3]);
        setButtonLabelPreserveChildren('leaderboardTabBorrowers', leaderboardTabs[4]);
        text('leaderboardTabTxProfitInfo', leaderboardTabInfo[0]);
        text('leaderboardTabLiquidationsInfo', leaderboardTabInfo[1]);
        text('leaderboardTabLiquidatorsInfo', leaderboardTabInfo[2]);
        text('leaderboardTabAssetsInfo', leaderboardTabInfo[3]);
        text('leaderboardTabBorrowersInfo', leaderboardTabInfo[4]);

        const protocolCols = t('protocolCols');
        ['phProtocol', 'phChain', 'phWallet', 'phRpcs', 'phTargets', 'phProfit'].forEach(function (id, index) {
          text(id, protocolCols[index]);
        });
        const strategyCols = t('strategyMarketCols');
        ['smMarket', 'smSegment', 'smPriority', 'smStatus', 'smCompetition', 'smNext'].forEach(function (id, index) {
          text(id, strategyCols[index]);
        });
        const flashloanProtocolCols = t('flashloanProtocolCols');
        ['fphProtocol', 'fphAmount', 'fphFee', 'fphFlashloanCount', 'fphTxCount', 'fphBorrowers', 'fphAssets'].forEach(function (id, index) {
          text(id, flashloanProtocolCols[index]);
        });
      }

      function applyChromeTranslations() {
        const version = state.data && state.data.version ? state.data.version : {};
        const appVersion = version.appVersion ? String(version.appVersion) : '';
        const githubVersion = version.githubVersion ? String(version.githubVersion) : '';
        const appDisplayVersion = version.appDisplayVersion ? String(version.appDisplayVersion) : appVersion;
        const githubDisplayVersion = version.githubDisplayVersion ? String(version.githubDisplayVersion) : githubVersion;
        text('appVersionChip', appDisplayVersion ? 'v' + appDisplayVersion : 'v--');
        text('connectButtonLabel', githubDisplayVersion ? 'GitHub v' + githubDisplayVersion : 'GitHub latest');
        if (version.updateRequired) {
          text('versionDropdownTitle', '发现新版本');
          text('versionDropdownSub', 'GitHub 最新版本 v' + (githubDisplayVersion || '--') + '，请先更新后继续使用。');
        } else if (githubDisplayVersion) {
          text('versionDropdownTitle', '你已经是最新版');
          text('versionDropdownSub', '版本号 v' + githubDisplayVersion);
        } else {
          text('versionDropdownTitle', '正在检查版本');
          text('versionDropdownSub', '等待 GitHub 版本信息。');
        }

        text('overviewPageTitle', t('pages.overview')[0]);
        text('overviewPageSub', t('pages.overview')[1]);
        text('liquidationPageTitle', t('pages.liquidation')[0]);
        text('liquidationPageSub', t('pages.liquidation')[1]);
        text('flashloanPageTitle', t('pages.flashloan')[0]);
        text('flashloanPageSub', t('pages.flashloan')[1]);
        text('flashloanConsolePageTitle', t('pages.flashloanConsole')[0]);
        text('flashloanConsolePageSub', t('pages.flashloanConsole')[1]);
        text('labPageTitle', t('pages.lab')[0]);
        text('labPageSub', t('pages.lab')[1]);
        text('morphoPageTitle', t('pages.morpho')[0]);
        text('morphoPageSub', t('pages.morpho')[1]);
        text('consolePageTitle', t('pages.console')[0]);
        text('consolePageSub', t('pages.console')[1]);
        text('arbitragePageTitle', t('pages.arbitrage')[0]);
        text('arbitragePageSub', '');
        text('txGraphPageTitle', t('pages.txgraph')[0]);
        text('txGraphPageSub', t('pages.txgraph')[1]);
        text('targetsPageTitle', t('pages.targets')[0]);
        text('targetsPageSub', t('targetsPageSub'));
        text('settingsPageTitle', t('pages.settings')[0]);
        text('settingsPageSub', t('settingsPageSub'));

        text('terminalTitle', t('terminalTitle'));
        text('terminalSub', t('terminalSub'));
        text('intelTitle', t('intelTitle'));
        text('intelSub', t('intelSub'));
        text('txGraphHashLabel', t('txGraphHash'));
        text('txGraphChainLabel', t('txGraphChain'));
        text('txGraphRpcLabel', t('txGraphRpc'));
        text('txGraphTransfersLabel', t('txGraphTransfers'));
        text('txGraphCallsLabel', t('txGraphCalls'));
        text('txGraphReferencesLabel', t('txGraphReferences'));
        text('txGraphLoadLabel', t('txGraphLoad'));
        text('txGraphSummaryTitle', t('txGraphSummary'));
        text('txGraphDetailTitle', t('txGraphSelectedDetail'));
        text('txGraphSummaryHashLabel', t('txGraphHash'));
        text('txGraphSummaryChainLabel', t('txGraphChain'));
        text('txGraphSummaryTransfersLabel', t('txGraphTransfers'));
        text('txGraphSummaryCallsLabel', t('txGraphCalls'));
        text('txGraphSummaryRefsLabel', t('txGraphReferences'));
        text('txGraphSummaryTraceLabel', 'Trace');
        text('walletTitle', t('walletTitle'));
        text('walletSub', t('walletSub'));

        const settingsSections = t('settingsSections');
        const settingsPanelTitles = t('settingsPanelTitles');
        const settingsPanelSubs = t('settingsPanelSubs');
        const settingsSection = state.settingsSection === 'exchanges' ? 'exchanges' : 'general';
        text('settingsMenuTitle', t('settingsMenuTitle'));
        text('settingsMenuSub', t('settingsMenuSub'));
        text('settingsPanelTitle', settingsSection === 'exchanges'
          ? settingsPanelTitles[1]
          : settingsPanelTitles[0]);
        text('settingsPanelSub', settingsSection === 'exchanges'
          ? settingsPanelSubs[1]
          : settingsPanelSubs[0]);
        text('settingsSectionGeneral', settingsSections[0]);
        text('settingsSectionExchanges', settingsSections[1]);
        text('saveSettingsButtonLabel', t('saveSettingsCompact'));
        text('toggleSettingsVisibilityLabel', state.settingsMasked ? t('settingsHideSecrets') : t('settingsShowSecrets'));

        text('settingsPrivateKeyLabel', 'PRIVATE_KEY');
        text('settingsBitqueryApiKeyLabel', t('settingsBitqueryApiKeyLabel'));
        text('settingsZeroExApiKeyLabel', t('settingsZeroExApiKeyLabel'));
        text('settingsQuickNodeApiKeyLabel', t('settingsQuickNodeApiKeyLabel'));
        text('settingsControlRpcLabel', state.language === 'zh' ? '控制 RPC' : 'Control RPC URL');
        text('settingsExecutionRpcLabel', state.language === 'zh' ? '执行 RPC' : 'Execution RPC URL');
        text('settingsFlashbotsRelayLabel', state.language === 'zh' ? 'Flashbots Relay' : 'Flashbots Relay URL');
        text('settingsFlashbotsAuthLabel', state.language === 'zh' ? 'Flashbots 认证私钥' : 'Flashbots Auth Private Key');
        text('settingsBroadcastTransportLabel', state.language === 'zh' ? '广播通道' : 'Broadcast transport');
        text('settingsFundingModeLabel', state.language === 'zh' ? '资金模式' : 'Funding mode');
        text('settingsEthereumRpcLabel', 'ETHEREUM_RPC_URL');
        text('settingsEthereumContractLabel', state.language === 'zh' ? 'Aave 合约地址' : 'Aave Ethereum contract');
        text('settingsDefaultMarketLabel', state.language === 'zh' ? '默认执行市场' : 'Default execution market');
        text('settingsSparkContractLabel', state.language === 'zh' ? 'Spark 合约地址' : 'Spark liquidator contract');
        text('settingsPolygonRpcLabel', 'POLYGON_RPC_URL');
        text('settingsPolygonContractLabel', state.language === 'zh' ? 'Polygon 合约地址' : 'Polygon liquidator contract');
        text('settingsArbitrumRpcLabel', 'ARBITRUM_RPC_URL');
        text('settingsArbitrumContractLabel', state.language === 'zh' ? 'Arbitrum 合约地址' : 'Arbitrum liquidator contract');
        text('settingsBnbRpcLabel', 'BNB_RPC_URL');
        text('settingsBnbContractLabel', state.language === 'zh' ? 'BNB 合约地址' : 'BNB liquidator contract');
        text('settingsBaseRpcLabel', 'BASE_RPC_URL');
        text('settingsExecutionLimitLabel', t('labels.limit'));
        text('settingsLanguageLabel', state.language === 'zh' ? '语言' : 'Language');
        text('settingsExchangeKeysLabel', state.language === 'zh' ? '交易所公钥 / 私钥' : 'Exchange API Keys');
        text('settingsBinanceApiKeyLabel', state.language === 'zh' ? 'Binance 公钥' : 'Binance API Key');
        text('settingsBinanceSecretKeyLabel', state.language === 'zh' ? 'Binance 私钥' : 'Binance Secret Key');
        text('settingsOkxApiKeyLabel', state.language === 'zh' ? 'OKX 公钥' : 'OKX API Key');
        text('settingsOkxSecretKeyLabel', state.language === 'zh' ? 'OKX 私钥' : 'OKX Secret Key');
        text('settingsBitgetApiKeyLabel', state.language === 'zh' ? 'Bitget 公钥' : 'Bitget API Key');
        text('settingsBitgetSecretKeyLabel', state.language === 'zh' ? 'Bitget 私钥' : 'Bitget Secret Key');
        text('settingsMexcApiKeyLabel', state.language === 'zh' ? 'MEXC 公钥' : 'MEXC API Key');
        text('settingsMexcSecretKeyLabel', state.language === 'zh' ? 'MEXC 私钥' : 'MEXC Secret Key');
        text('settingsGateApiKeyLabel', state.language === 'zh' ? 'Gate 公钥' : 'Gate API Key');
        text('settingsGateSecretKeyLabel', state.language === 'zh' ? 'Gate 私钥' : 'Gate Secret Key');
        const modalClose = document.getElementById('modalClose');
        if (modalClose) modalClose.setAttribute('aria-label', t('close'));
        setIconButtonTitle('terminalExpand', t('expand'));

        text('distributionFootnoteModal', t('distributionFootnote'));
      }
`;
