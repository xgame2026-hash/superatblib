SELECT
  count(*) FILTER (WHERE heartbeat_at > now() - interval '1 minute') AS recent_heartbeats,
  count(*) FILTER (WHERE client_ip_updated_at > now() - interval '1 minute') AS recent_ip_updates,
  count(*) FILTER (WHERE client_ip IS NOT NULL) AS captured_rows
FROM public.wallet_presence;
