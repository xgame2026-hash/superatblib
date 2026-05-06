export const DASHBOARD_DOCUMENT_HEAD = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Liquidation Workstation</title>
    <link rel="icon" type="image/svg+xml" href="/img/aave-token-round.svg" />
    <link rel="shortcut icon" href="/img/aave-token-round.svg" />
    <link rel="apple-touch-icon" href="/img/aave-token-round.svg" />
    <style>
`;

export const DASHBOARD_DOCUMENT_BODY_OPEN = String.raw`
    </style>
  </head>
  <body>
`;

export const DASHBOARD_VENDOR_SCRIPTS = String.raw`
    <script src="/vendor/chart.js"></script>
    <script src="/vendor/cytoscape.js"></script>
    <script src="/vendor/webcola.js"></script>
    <script src="/vendor/cytoscape-cola.js"></script>
`;

export const DASHBOARD_DOCUMENT_FOOT = String.raw`
  </body>
</html>`;
