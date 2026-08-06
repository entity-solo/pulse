-- Unschedule legacy monolithic cron job
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'pulse-sync-every-15-minutes';
