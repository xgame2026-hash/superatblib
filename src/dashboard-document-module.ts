export const DASHBOARD_DOCUMENT_HEAD = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SuperARB</title>
    <meta name="application-name" content="SuperARB" />
    <meta name="apple-mobile-web-app-title" content="SuperARB" />
    <meta name="theme-color" content="#101214" />
    <link rel="icon" type="image/png" sizes="192x192" href="/img/SuperARB_icon_192.png?v=20260507" />
    <link rel="icon" type="image/png" sizes="512x512" href="/img/SuperARB_icon_512.png?v=20260507" />
    <link rel="shortcut icon" href="/favicon.ico?v=20260507" />
    <link rel="apple-touch-icon" sizes="180x180" href="/img/SuperARB_icon_192.png?v=20260507" />
    <link rel="manifest" href="/manifest.webmanifest?v=20260507" />
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
