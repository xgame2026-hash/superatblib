export const DASHBOARD_LAB_EVENTS_LOGIC = String.raw`
      function bindLabDashboardEvents() {
        hydrateLabState();

        [
          'labMarketSelect',
          'labBorrowAssetSelect',
          'labBorrowAmountInput',
          'labTargetAssetSelect',
          'labHopAssetSelect',
          'labBuyVenueSelect',
          'labSellVenueSelect',
          'labSlippageInput',
          'labMinProfitInput'
        ].forEach(function (id) {
          const node = document.getElementById(id);
          if (!node) return;
          node.addEventListener('input', function () {
            syncLabStateFromInputs(id);
            renderLab();
          });
          node.addEventListener('change', function () {
            syncLabStateFromInputs(id);
            renderLab();
          });
        });

        const palette = document.getElementById('labActionPalette');
        if (palette) {
          palette.addEventListener('click', function (event) {
            const tile = event.target.closest('[data-lab-action]');
            if (!tile) return;
            addLabNode(tile.getAttribute('data-lab-action'));
          });
          palette.addEventListener('dragstart', function (event) {
            const tile = event.target.closest('[data-lab-action]');
            if (!tile || !event.dataTransfer) return;
            event.dataTransfer.setData('application/x-lab-action', tile.getAttribute('data-lab-action'));
            event.dataTransfer.effectAllowed = 'copy';
          });
        }

        const builder = document.getElementById('labBuilder');
        if (builder) {
          builder.addEventListener('click', function (event) {
            const up = event.target.closest('[data-lab-node-up]');
            const down = event.target.closest('[data-lab-node-down]');
            const remove = event.target.closest('[data-lab-node-remove]');
            if (up) {
              const index = Number(up.getAttribute('data-lab-node-up'));
              moveLabNode(index, index - 1);
              return;
            }
            if (down) {
              const index = Number(down.getAttribute('data-lab-node-down'));
              moveLabNode(index, index + 1);
              return;
            }
            if (remove) {
              removeLabNode(Number(remove.getAttribute('data-lab-node-remove')));
              return;
            }
            const selectedNode = event.target.closest('[data-lab-node-index]');
            if (selectedNode) {
              selectLabNode(Number(selectedNode.getAttribute('data-lab-node-index')));
            }
          });
          builder.addEventListener('dragstart', function (event) {
            const node = event.target.closest('[data-lab-node-index]');
            if (!node || !event.dataTransfer) return;
            event.dataTransfer.setData('application/x-lab-node-index', node.getAttribute('data-lab-node-index'));
            event.dataTransfer.effectAllowed = 'move';
          });
          builder.addEventListener('dragover', function (event) {
            const target = event.target.closest('[data-lab-node-index]');
            if (!target) return;
            event.preventDefault();
            target.classList.add('is-drag-over');
          });
          builder.addEventListener('dragleave', function (event) {
            const target = event.target.closest('[data-lab-node-index]');
            if (target) target.classList.remove('is-drag-over');
          });
          builder.addEventListener('drop', function (event) {
            const target = event.target.closest('[data-lab-node-index]');
            if (!target || !event.dataTransfer) return;
            event.preventDefault();
            target.classList.remove('is-drag-over');
            const toIndex = Number(target.getAttribute('data-lab-node-index'));
            const fromIndex = Number(event.dataTransfer.getData('application/x-lab-node-index'));
            const action = event.dataTransfer.getData('application/x-lab-action');
            if (Number.isFinite(fromIndex)) {
              moveLabNode(fromIndex, toIndex);
              return;
            }
            if (action) {
              insertLabNode(action, toIndex);
            }
          });
        }

        const dropzone = document.getElementById('labDropzone');
        if (dropzone) {
          dropzone.addEventListener('dragover', function (event) {
            event.preventDefault();
            dropzone.classList.add('is-drag-over');
          });
          dropzone.addEventListener('dragleave', function () {
            dropzone.classList.remove('is-drag-over');
          });
          dropzone.addEventListener('drop', function (event) {
            if (!event.dataTransfer) return;
            event.preventDefault();
            dropzone.classList.remove('is-drag-over');
            const action = event.dataTransfer.getData('application/x-lab-action');
            const fromIndex = Number(event.dataTransfer.getData('application/x-lab-node-index'));
            if (action) {
              addLabNode(action);
            } else if (Number.isFinite(fromIndex)) {
              moveLabNode(fromIndex, state.lab.nodes.length - 1);
            }
          });
        }

        const launch = document.getElementById('labActionLaunch');
        if (launch) {
          launch.addEventListener('click', function () {
            void launchLabStrategy();
          });
        }

        const addHop = document.getElementById('labActionAddHop');
        if (addHop) {
          addHop.addEventListener('click', function () {
            syncLabStateFromInputs('labActionAddHop');
            addLabHop();
          });
        }

        const reset = document.getElementById('labActionReset');
        if (reset) {
          reset.addEventListener('click', function () {
            resetLabBuilder();
          });
        }
      }
`;
