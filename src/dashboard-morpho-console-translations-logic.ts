export const DASHBOARD_MORPHO_CONSOLE_TRANSLATIONS_LOGIC = String.raw`
      function applyMorphoTranslations() {
        text('morphoBlueTitle', t('morphoBlueTitle'));
        text('morphoBlueSub', t('morphoBlueSub'));
        text('morphoBlueInfo', t('morphoBlueInfo'));

        const morphoMetrics = t('morphoBlueMetrics');
        ['morphoBlueMetricMarketsLabel', 'morphoBlueMetricLiveLabel', 'morphoBlueMetricSupplyLabel', 'morphoBlueMetricBorrowLabel', 'morphoBlueMetricRiskyLabel', 'morphoBlueMetricNearLabel', 'morphoBlueMetricLiqLabel', 'morphoBlueMetricRiskBorrowLabel'].forEach(function (id, index) {
          text(id, morphoMetrics[index]);
        });

        const morphoCols = t('morphoBlueCols');
        ['morphoBlueThMarket', 'morphoBlueThPair', 'morphoBlueThLltv', 'morphoBlueThUtilization', 'morphoBlueThBorrow'].forEach(function (id, index) {
          text(id, morphoCols[index]);
        });

        text('morphoBlueOpportunityTitle', t('morphoBlueOpportunityTitle'));
        text('morphoBlueOpportunitySub', t('morphoBlueOpportunitySub'));
        const morphoOpportunityViews = t('morphoBlueOpportunityViews');
        text('morphoOpportunityViewAll', morphoOpportunityViews[0]);
        text('morphoOpportunityViewLiq', morphoOpportunityViews[1]);
        text('morphoOpportunityViewNear', morphoOpportunityViews[2]);
        text('morphoOpportunityViewRisky', morphoOpportunityViews[3]);
        text('morphoOpportunityRefresh', state.morphoOverviewRefreshing ? t('morphoBlueOpportunityRefreshing') : t('morphoBlueOpportunityRefresh'));

        const morphoOpportunityCols = t('morphoBlueOpportunityCols');
        ['morphoBlueOpportunityThMarket', 'morphoBlueOpportunityThUser', 'morphoBlueOpportunityThSignal', 'morphoBlueOpportunityThHf', 'morphoBlueOpportunityThBorrow', 'morphoBlueOpportunityThGap'].forEach(function (id, index) {
          text(id, morphoOpportunityCols[index]);
        });

        text('morphoExecutorTitle', t('morphoExecutorTitle'));
        text('morphoExecutorSub', t('morphoExecutorSub'));
        text('morphoExecutorCheckButton', state.morphoExecutorChecking ? t('morphoExecutorChecking') : t('morphoExecutorCheck'));
      }

      function applyConsoleTranslations() {
        text('controlTitle', t('controlTitle'));
        text('controlSub', t('controlSub'));

        const labels = t('labels');
        text('labelChain', labels.chain);
        text('labelLookback', labels.lookback);
        text('labelLimit', labels.limit);
        text('labelMinProfit', labels.minProfit);
        text('labelRpc', labels.rpc);
        text('labelAddressProvider', labels.addressProvider);
        text('labelDebtFilter', labels.debtFilter);
        text('labelCollateralFilter', labels.collateralFilter);
        text('labelHfMax', labels.hfMax);
        text('labelMorphoMarketId', labels.morphoMarketId);
        text('labelMorphoSignal', labels.morphoSignal);
        text('labelDatasetMode', labels.datasetMode);
        text('labelUser', labels.user);
        text('labelContract', labels.contract);

        const toggles = t('toggles');
        text('toggleAllowRisky', toggles.allowRisky);
        text('toggleDistribute', toggles.distribute);
        text('toggleDeploy', toggles.deploy);
        text('toggleLiquidatableOnly', toggles.liquidationOnly);

        const actions = t('actions');
        setActionButtonLabel('actionScan', actions.scan);
        setActionButtonLabel('actionAnalyze', actions.analyze);
        setActionButtonLabel('actionMorphoReadOnly', actions.morphoReadOnly);
        setActionButtonLabel('actionSelfFunded', actions.selfFunded);
        setActionButtonLabel('actionPause', actions.pause);

        const morphoSignalOptions = t('morphoSignalOptions');
        ['morphoKindAll', 'morphoKindLiquidatable', 'morphoKindNear', 'morphoKindRisky'].forEach(function (id, index) {
          text(id, morphoSignalOptions[index]);
        });

        text('targetsAutoSwapLabel', t('targetsToolbar')[0]);
        text('targetsAutoDistributeLabel', t('targetsToolbar')[1]);
        text('targetsDeployIfMissingLabel', t('targetsToolbar')[2]);
        text('targetsLiquidationOnlyLabel', t('targetsToolbar')[3]);
        text('consoleFilterSignalLabel', state.language === 'zh' ? '信号' : 'Signal');
        text('consoleFilterSourceLabel', t('consoleSourceLabel'));

        text('thUser', state.language === 'zh' ? '用户' : 'User');
        text('thHf', 'HF');
        text('thState', state.language === 'zh' ? '状态' : 'State');
        text('thDebt', state.language === 'zh' ? '债务' : 'Debt');
        text('thCollateral', state.language === 'zh' ? '抵押' : 'Collateral');
        text('thGross', state.language === 'zh' ? '毛利' : 'Gross');
        text('thRank', state.language === 'zh' ? '排名' : 'Rank');
        text('thNet', state.language === 'zh' ? '粗净利' : 'Rough Net');
        text('thView', state.language === 'zh' ? '查看' : 'View');

        text('consoleResultsThMarket', state.language === 'zh' ? '市场' : 'Market');
        text('consoleResultsThUser', state.language === 'zh' ? '用户' : 'User');
        text('consoleResultsThHf', 'HF');
        text('consoleResultsThState', state.language === 'zh' ? '状态' : 'State');
        text('consoleResultsThExec', state.language === 'zh' ? '执行' : 'Execution');
        text('consoleResultsThDebt', state.language === 'zh' ? '债务' : 'Debt');
        text('consoleResultsThCollateral', state.language === 'zh' ? '抵押' : 'Collateral');
        text('consoleResultsThGross', state.language === 'zh' ? '毛利' : 'Gross');
        text('consoleResultsThNet', state.language === 'zh' ? '粗净利' : 'Rough Net');
        text('consoleSourceAll', t('consoleSourceAll'));
        text('consoleSourceMorpho', t('consoleSourceMorpho'));

        text('selectedUserLabel', state.language === 'zh' ? '用户' : 'User');
        text('selectedSignalLabel', state.language === 'zh' ? '信号' : 'Signal');
        text('selectedDebtLabel', state.language === 'zh' ? '债务' : 'Debt');
        text('selectedCollateralLabel', state.language === 'zh' ? '抵押' : 'Collateral');
      }
`;
