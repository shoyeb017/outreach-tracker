-- OPTIONAL ACTIVATION, not part of the schema migration. Sends can run only after
-- the administrator also enables Scheduled sending in AUTMAIL.
-- First deploy the worker and add these two entries using Supabase Vault:
-- autmail_scheduler_url: https://YOUR_PROJECT.supabase.co/functions/v1/scheduled-mail-worker
-- autmail_scheduler_worker_secret: same SCHEDULE_WORKER_SECRET as the Edge Function
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ declare endpoint text; secret text; begin
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='autmail_scheduler_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name='autmail_scheduler_worker_secret';
  if endpoint is null or endpoint !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/scheduled-mail-worker$' or length(coalesce(secret,''))<32 then
    raise exception 'Configure the worker URL and a strong worker secret in Vault before enabling Cron.';
  end if;
end $$;
select cron.schedule('autmail-scheduled-mail','* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='autmail_scheduler_url'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='autmail_scheduler_worker_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 100000
  );
$job$);
-- Bound Cron log growth on the Free database. Does not delete email history.
select cron.schedule('autmail-scheduler-log-cleanup','17 3 * * *', $job$
  delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname in ('autmail-scheduled-mail','autmail-scheduler-log-cleanup')) and end_time<now()-interval '7 days';
$job$);
