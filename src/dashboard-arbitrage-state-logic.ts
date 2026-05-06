export const DASHBOARD_ARBITRAGE_STATE_LOGIC = String.raw`
      function normalizeArbitrageTokenPreference(value) {
        if (typeof value !== 'string') return '';
        return value
          .split(/[\\n,]/)
          .map(function (item) {
            const normalized = String(item || '').trim().toUpperCase();
            if (!normalized) return '';
            if (normalized.includes('/')) {
              const parts = normalized.split('/');
              if (parts.length === 2 && parts[1] === 'USDT') {
                return parts[0];
              }
              return normalized;
            }
            return normalized.endsWith('USDT') ? normalized.slice(0, -4) : normalized;
          })
          .filter(Boolean)
          .join(', ');
      }

      function readStoredArbitrageToken() {
        try {
          return normalizeArbitrageTokenPreference(localStorage.getItem(ARBITRAGE_TOKEN_STORAGE_KEY) || '');
        } catch (_error) {
          return '';
        }
      }

      function persistArbitrageTokenPreference(value) {
        const normalized = normalizeArbitrageTokenPreference(value);
        try {
          if (normalized) {
            localStorage.setItem(ARBITRAGE_TOKEN_STORAGE_KEY, normalized);
          } else {
            localStorage.removeItem(ARBITRAGE_TOKEN_STORAGE_KEY);
          }
        } catch (_error) {}
        return normalized;
      }
`;
