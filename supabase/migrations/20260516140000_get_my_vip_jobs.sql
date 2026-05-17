-- RPC para o dashboard do portal: vagas que JA foram enviadas ao VIP logado.
-- Cada assinante so enxerga as proprias entregas (filtro por wa_lid via auth.uid()).
-- SECURITY DEFINER porque enriquece com a tabela jobs (que so admin le via RLS).
create or replace function public.get_my_vip_jobs()
returns table (
  job_id           text,
  sent_at          timestamptz,
  match_score      integer,
  title            text,
  company          text,
  location         text,
  state_code       text,
  country_code     text,
  work_type        text,
  hiring_regime    text,
  salary_raw       text,
  salary_min       integer,
  salary_max       integer,
  salary_currency  text,
  publication_date date,
  source           text,
  skills           text[],
  url              text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    vdh.job_id,
    vdh.sent_at,
    vdh.match_score,
    coalesce(j.job_title, vdh.job_snapshot->>'title')                          as title,
    coalesce(j.company, vdh.job_snapshot->>'company')                          as company,
    coalesce(j.location_raw, vdh.job_snapshot->>'location')                    as location,
    j.state_code,
    j.country_code,
    coalesce(j.work_type, vdh.job_snapshot->>'work_model')                     as work_type,
    j.hiring_regime,
    coalesce(j.salary_raw, vdh.job_snapshot->>'salary')                        as salary_raw,
    j.salary_min,
    j.salary_max,
    j.salary_currency,
    coalesce(
      j.publication_date,
      nullif(vdh.job_snapshot->>'publication_date', '')::date
    )                                                                          as publication_date,
    coalesce(j.source, vdh.job_snapshot->>'source')                            as source,
    coalesce(
      j.skills,
      (select array_agg(value)
         from jsonb_array_elements_text(coalesce(vdh.job_snapshot->'tags', '[]'::jsonb)))
    )                                                                          as skills,
    coalesce(j.job_url, vdh.job_snapshot->>'url')                              as url
  from vip_delivery_history vdh
  left join jobs j on j.job_url = (vdh.job_snapshot->>'url')
  where vdh.lid in (
    select sp.wa_lid
      from subscriber_profiles sp
      join subscribers s on s.id = sp.subscriber_id
     where s.user_id = auth.uid()
       and sp.wa_lid is not null
  )
    and coalesce(j.job_title, vdh.job_snapshot->>'title') is not null
  order by vdh.sent_at desc;
$$;

revoke all on function public.get_my_vip_jobs() from public, anon;
grant execute on function public.get_my_vip_jobs() to authenticated;
