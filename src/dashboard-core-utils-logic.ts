export const DASHBOARD_CORE_UTILS_LOGIC = String.raw`
      function text(id, value) {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
      }

      function html(id, value) {
        const node = document.getElementById(id);
        if (node) node.innerHTML = value;
      }

      function qs(selector) {
        return document.querySelector(selector);
      }

      function qsa(selector) {
        return Array.from(document.querySelectorAll(selector));
      }

      function escapeHtml(value) {
        return String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function toNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
          const matched = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
          if (!matched) return null;
          const numeric = Number(matched[0]);
          return Number.isFinite(numeric) ? numeric : null;
        }
        return null;
      }

      function statusToneFromHf(hf) {
        const numeric = toNumber(hf);
        if (numeric === null) return 'status-blue';
        if (numeric < 1) return 'status-bad';
        if (numeric < 1.05) return 'status-warn';
        return 'status-good';
      }

      function statusTextFromHf(hf) {
        const numeric = toNumber(hf);
        if (numeric === null) return '--';
        if (numeric < 1) return state.language === 'zh' ? '可清算' : 'liquidatable';
        if (numeric < 1.05) return state.language === 'zh' ? '高风险' : 'risky';
        return state.language === 'zh' ? '观察中' : 'watch';
      }

      function copyActionLabel() {
        return state.language === 'zh' ? '复制' : 'Copy';
      }

      function copiedActionLabel() {
        return state.language === 'zh' ? '已复制' : 'Copied';
      }

      async function copyTextToClipboard(value) {
        if (!value) return;
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value);
          return;
        }
        const input = document.createElement('textarea');
        input.value = value;
        input.setAttribute('readonly', 'readonly');
        input.style.position = 'absolute';
        input.style.left = '-9999px';
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }

      function setButtonLabelPreserveChildren(id, label) {
        const node = document.getElementById(id);
        if (!node) return;
        const info = node.querySelector('.info-trigger');
        node.textContent = '';
        node.appendChild(document.createTextNode(label + ' '));
        if (info) node.appendChild(info);
      }

      function setActionButtonLabel(id, label) {
        const node = document.getElementById(id);
        if (!node) return;
        const labelNode = node.querySelector('.action-button-label');
        if (labelNode) {
          labelNode.textContent = label;
          return;
        }
        node.textContent = label;
      }

      function setIconButtonTitle(id, label) {
        const node = document.getElementById(id);
        if (!node) return;
        node.setAttribute('aria-label', label);
        node.setAttribute('title', label);
      }
`;
