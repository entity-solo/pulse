-- Helper function to inspect pg_cron job_run_details safely
create or replace function get_cron_run_details()
returns table (
  jobid bigint,
  runid bigint,
  job_pid integer,
  database text,
  username text,
  command text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz,
  jobname text
)
language sql
security definer
as $$
  select
    j.jobid,
    d.runid,
    d.job_pid,
    d.database,
    d.username,
    d.command,
    d.status,
    d.return_message,
    d.start_time,
    d.end_time,
    j.jobname
  from cron.job_run_details d
  left join cron.job j on j.jobid = d.jobid
  order by d.start_time desc
  limit 10;
$$;
