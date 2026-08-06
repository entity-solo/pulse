-- Helper function to inspect net._http_response table safely
create or replace function get_net_http_responses()
returns table (
  id bigint,
  status_code integer,
  content text,
  error_msg text,
  created timestamptz
)
language sql
security definer
as $$
  select id, status_code, content, error_msg, created
  from net._http_response
  order by created desc
  limit 5;
$$;
