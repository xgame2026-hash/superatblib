export const DASHBOARD_TARGETS_SHARED_LOGIC = String.raw`
      function targetIdentityKey(target) {
        if (!target) return '--::--';
        const marketKey = target.marketKey ? String(target.marketKey).toLowerCase() : '--';
        const user = target.user ? String(target.user).toLowerCase() : '--';
        return marketKey + '::' + user;
      }

      function deriveTargetMarketLabel(marketKey, fallback) {
        const config = state.data && state.data.config ? state.data.config : null;
        const markets = config && Array.isArray(config.executionMarkets) ? config.executionMarkets : [];
        const matched = markets.find(function (item) {
          return String(item && item.key ? item.key : '').toLowerCase() === String(marketKey || '').toLowerCase();
        });
        if (matched && matched.label) {
          return String(matched.label);
        }
        return String(fallback || marketKey || '--');
      }
`;
