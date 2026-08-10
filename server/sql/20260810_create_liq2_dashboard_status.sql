CREATE TABLE IF NOT EXISTS public.liq2_dashboard_status (
  status_key text PRIMARY KEY,
  headline text NOT NULL CHECK (char_length(headline) BETWEEN 1 AND 240),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT 'system'
);

INSERT INTO public.liq2_dashboard_status (status_key, headline, updated_by)
VALUES ('monthly_liquidation_reward', '正在进行 本月第3轮清算奖励发放', 'initial-migration')
ON CONFLICT (status_key) DO NOTHING;
