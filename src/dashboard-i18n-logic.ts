export const DASHBOARD_I18N_LOGIC = String.raw`
      function t(path) {
        const parts = path.split('.');
        let cursor = translations[state.language];
        for (const part of parts) {
          cursor = cursor && cursor[part];
        }
        return cursor;
      }
`;
