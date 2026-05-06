import { DASHBOARD_RUNTIME_CORE_ASSEMBLY } from './dashboard-runtime-core-assembly.js';
import { DASHBOARD_RUNTIME_MORPHO_TARGETS_ASSEMBLY } from './dashboard-runtime-morpho-targets-assembly.js';
import { DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY } from './dashboard-runtime-operations-assembly.js';
import { DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY } from './dashboard-runtime-overview-assembly.js';

// Runtime is assembled in dependency order before creating the shared console controller.
export const DASHBOARD_RUNTIME_ASSEMBLY = String.raw`
${DASHBOARD_RUNTIME_CORE_ASSEMBLY}
${DASHBOARD_RUNTIME_MORPHO_TARGETS_ASSEMBLY}
${DASHBOARD_RUNTIME_OVERVIEW_ASSEMBLY}
${DASHBOARD_RUNTIME_OPERATIONS_ASSEMBLY}

      const consoleController = createDashboardConsoleController({
        state,
        t,
        text,
        html,
        escapeHtml,
        shortAddress,
        toNumber,
        statusToneFromHf,
        formatMetricNumber,
        setAnimatedMetric,
        currentQuicknodeMetric,
        deriveTargets,
        applyMorphoMarketFilter,
        syncFormFromInputs,
        renderAll,
        openModal
      });

      init();
    </script>
`;
