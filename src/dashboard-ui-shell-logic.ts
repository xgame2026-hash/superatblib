export const DASHBOARD_UI_SHELL_LOGIC = String.raw`
      function openModal(title, body) {
        const card = document.querySelector('#modal .modal-card');
        if (card) card.className = 'panel modal-card';
        text('modalTitle', title);
        text('modalSub', '');
        html('modalBody', '<pre class="modal-pre">' + escapeHtml(body) + '</pre>');
        document.getElementById('modal').classList.add('open');
      }

      function openModalHtml(title, sub, bodyHtml, modalClass) {
        const card = document.querySelector('#modal .modal-card');
        if (card) card.className = 'panel modal-card' + (modalClass ? ' ' + modalClass : '');
        text('modalTitle', title);
        text('modalSub', sub || '');
        html('modalBody', bodyHtml);
        document.getElementById('modal').classList.add('open');
      }

      function openMessageDialog(title, body) {
        openModalHtml(
          title,
          '',
          '<div class="message-dialog-body">' + escapeHtml(body) + '</div>' +
            '<div class="message-dialog-actions"><button type="button" data-modal-confirm>' +
            escapeHtml(t('confirm')) +
            '</button></div>',
          'message-dialog'
        );
      }

      function setSavingOverlay(visible) {
        const overlay = document.getElementById('savingOverlay');
        if (!overlay) return;
        text('savingOverlayText', t('settingsSavingMessage'));
        overlay.classList.toggle('open', Boolean(visible));
        overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
      }

      function closeModal() {
        destroyChart('modalTrend');
        destroyChart('modalDistribution');
        const card = document.querySelector('#modal .modal-card');
        if (card) card.className = 'panel modal-card';
        document.getElementById('modal').classList.remove('open');
      }

      function txGraphFullscreenElement() {
        return document.fullscreenElement
          || document.webkitFullscreenElement
          || document.mozFullScreenElement
          || document.msFullscreenElement
          || null;
      }

      function exitAnyFullscreen() {
        if (document.exitFullscreen) return document.exitFullscreen();
        if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
        if (document.mozCancelFullScreen) return document.mozCancelFullScreen();
        if (document.msExitFullscreen) return document.msExitFullscreen();
        return Promise.resolve();
      }

      function requestPanelFullscreen(panel) {
        if (panel.requestFullscreen) return panel.requestFullscreen();
        if (panel.webkitRequestFullscreen) return panel.webkitRequestFullscreen();
        if (panel.mozRequestFullScreen) return panel.mozRequestFullScreen();
        if (panel.msRequestFullscreen) return panel.msRequestFullscreen();
        return Promise.resolve();
      }

      function toggleTxGraphFullscreen() {
        const panel = document.querySelector('.txgraph-canvas-panel');
        if (!panel) return;
        const fullscreenEl = txGraphFullscreenElement();
        if (fullscreenEl === panel) {
          Promise.resolve(exitAnyFullscreen()).catch(function () {});
          return;
        }
        Promise.resolve(requestPanelFullscreen(panel)).catch(function () {});
      }

      function syncTxGraphViewport() {
        if (!state.txGraph.cy) return;
        state.txGraph.cy.resize();
        state.txGraph.cy.fit(undefined, 40);
      }

      function openChartModal(kind) {
        const overview = state.data.eigenphiOverview;
        if (!overview) return;
        if (kind === 'trend') {
          openModalHtml(
            t('trendTitle'),
            '',
            '<div class="chart-frame"><div id="modalTrendChart" class="chart-stage modal-chart-stage"></div></div><div class="chart-widget-foot"><div id="modalTrendUpdated" class="chart-updated">--</div><div></div></div>',
            'chart-modal'
          );
          renderEigenphiTrend(overview, { containerId: 'modalTrendChart', updatedId: 'modalTrendUpdated', chartKey: 'modalTrend' });
          return;
        }
        if (kind === 'distribution') {
          openModalHtml(
            t('distributionTitle'),
            '',
            '<div class="chart-frame"><div id="modalDistributionChart" class="chart-stage modal-chart-stage"></div></div><div class="chart-widget-foot"><div id="modalDistributionUpdated" class="chart-updated">--</div><div id="distributionFootnoteModal">*PDF: Probability Density Function</div></div>',
            'chart-modal'
          );
          renderEigenphiDistribution(overview, { containerId: 'modalDistributionChart', updatedId: 'modalDistributionUpdated', chartKey: 'modalDistribution' });
        }
      }

      function openTxGraphForHash(hash) {
        const nextHash = String(hash || '').trim();
        if (!nextHash) return;
        state.txGraph.hash = nextHash;
        state.txGraph.chain = 'ethereum';
        syncTxGraphRpcFromConfig({ force: true });
        setPage('txgraph');
        requestAnimationFrame(function () {
          loadTxGraphData();
        });
      }
`;
