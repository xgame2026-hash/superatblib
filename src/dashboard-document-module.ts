export const DASHBOARD_DOCUMENT_HEAD = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SuperARB</title>
    <meta name="application-name" content="SuperARB" />
    <meta name="apple-mobile-web-app-title" content="SuperARB" />
    <meta name="theme-color" content="#101214" />
    <link rel="icon" type="image/png" href="/img/SuperARB_logo.png" />
    <link rel="shortcut icon" type="image/png" href="/img/SuperARB_logo.png" />
    <link rel="apple-touch-icon" href="/img/SuperARB_logo.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
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
