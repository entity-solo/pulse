-- 027: Retire the legacy Deno sync edge function and its pg_cron jobs.
-- The Next.js pipeline (app/api/cron/* -> lib/pipeline/) is now the source of
-- truth. This unschedules every pg_cron job that targets the sync function and
-- drops the RPC that could re-create them.

-- 1. Unschedule all pg_cron jobs pointing at the sync edge function:
--    - every historical jobname (pulse-sync-*)
--    - leftover unnamed jobs
--    - any job whose command references /functions/v1/sync (belt and braces)
select cron.unschedule(jobid)
from cron.job
where jobname like 'pulse-sync-%'
   or jobname is null
   or command like '%/functions/v1/sync%';

-- 2. Drop the helper that reschedules the legacy jobs, so they cannot return.
drop function if exists reschedule_all_cron_jobs(text, text, text);
