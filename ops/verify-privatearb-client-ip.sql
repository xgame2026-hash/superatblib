SELECT
  count(*) FILTER (WHERE client_ip IS NOT NULL) AS captured_rows,
  count(*) FILTER (
    WHERE client_ip <<= ANY (ARRAY[
      '173.245.48.0/20'::inet, '103.21.244.0/22'::inet, '103.22.200.0/22'::inet,
      '103.31.4.0/22'::inet, '141.101.64.0/18'::inet, '108.162.192.0/18'::inet,
      '190.93.240.0/20'::inet, '188.114.96.0/20'::inet, '197.234.240.0/22'::inet,
      '198.41.128.0/17'::inet, '162.158.0.0/15'::inet, '104.16.0.0/13'::inet,
      '104.24.0.0/14'::inet, '172.64.0.0/13'::inet, '131.0.72.0/22'::inet,
      '2400:cb00::/32'::inet, '2606:4700::/32'::inet, '2803:f800::/32'::inet,
      '2405:b500::/32'::inet, '2405:8100::/32'::inet, '2a06:98c0::/29'::inet,
      '2c0f:f248::/32'::inet
    ])
  ) AS cloudflare_edge_rows,
  count(*) FILTER (
    WHERE client_ip << ANY (ARRAY[
      '10.0.0.0/8'::inet, '172.16.0.0/12'::inet, '192.168.0.0/16'::inet,
      '127.0.0.0/8'::inet, 'fc00::/7'::inet, '::1/128'::inet
    ])
  ) AS private_or_loopback_rows
FROM public.wallet_presence;

SELECT count(*) AS synthetic_test_wallets
FROM public.wallets
WHERE lower(wallet_address) = lower('0x0000000000000000000000000000000000000000');
