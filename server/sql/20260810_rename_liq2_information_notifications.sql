DO $$
BEGIN
  IF to_regclass('public.liq2_dashboard_status') IS NOT NULL
     AND to_regclass('public.liq2_information_notifications') IS NULL THEN
    ALTER TABLE public.liq2_dashboard_status RENAME TO liq2_information_notifications;
    ALTER TABLE public.liq2_information_notifications RENAME COLUMN status_key TO notification_key;
    ALTER TABLE public.liq2_information_notifications RENAME COLUMN headline TO content;
  END IF;
END $$;

ALTER TABLE public.liq2_information_notifications
  ALTER COLUMN content SET NOT NULL;

INSERT INTO public.liq2_information_notifications (notification_key, content, updated_by)
VALUES ('monthly_liquidation_reward', '正在进行 本月第3轮清算奖励发放', 'initial-migration')
ON CONFLICT (notification_key) DO NOTHING;
