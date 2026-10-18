-- Run once in Supabase SQL Editor AFTER 20261019_email_engagement.sql.
-- Enable the pg_cron extension in Database > Extensions if it is not already enabled.
-- Only an hourly database cleanup is scheduled. This does not send emails or use HTTP secrets.
select cron.schedule(
  'autmail-engagement-cleanup',
  '17 * * * *',
  $$select public.engagement_prune();$$
);

-- Verify: the named job must be active. It removes up to 1,000 expired rows per run.
select jobname,active,schedule from cron.job where jobname='autmail-engagement-cleanup';
