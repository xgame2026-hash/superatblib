BEGIN;

ALTER TABLE public.wallet_presence
  ADD COLUMN IF NOT EXISTS client_ip inet,
  ADD COLUMN IF NOT EXISTS client_ip_updated_at timestamptz;

COMMENT ON COLUMN public.wallet_presence.client_ip IS
  '最近一次 LIQ2 execution heartbeat 的可信客户端公网 IP（由 Nginx/Cloudflare 提取，不接受请求体自报）';
COMMENT ON COLUMN public.wallet_presence.client_ip_updated_at IS
  'client_ip 最近一次由可信代理更新的时间';

COMMIT;
