-- Helper function to inspect pg_cron registered jobs safely
create or replace function get_cron_jobs()
returns table (
  jobid bigint,
  schedule text,
  command text,
  nodename text,
  nodeport integer,
  database text,
  username text,
  active boolean,
  jobname text
)
language sql
security definer
as $$
  select jobid, schedule, command, nodename, nodeport, database, username, active, jobname
  from cron.job;
$$;
