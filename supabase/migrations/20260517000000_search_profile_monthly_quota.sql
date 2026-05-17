-- Quota mensal de alteracoes do perfil de busca (3 por mes-calendario).
alter table public.subscriber_profiles
  add column if not exists edits_count integer not null default 0,
  add column if not exists edits_month date;

comment on column public.subscriber_profiles.edits_count is
  'Quantidade de alteracoes do perfil no mes corrente (edits_month).';
comment on column public.subscriber_profiles.edits_month is
  'Mes-calendario (dia 1) ao qual edits_count se refere. Vira => contagem zera.';

-- Salva o perfil de busca aplicando o limite de 3 alteracoes/mes.
-- A criacao inicial do perfil NAO conta como alteracao.
create or replace function public.save_search_profile(
  p_whatsapp     text,
  p_stack        text[],
  p_seniority    seniority_level,
  p_work_models  text[],
  p_location     text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscriber_id uuid;
  v_profile       subscriber_profiles%rowtype;
  v_this_month    date := date_trunc('month', now())::date;
  v_limit         int  := 3;
  v_used          int;
begin
  select id into v_subscriber_id
    from subscribers
   where user_id = auth.uid();
  if v_subscriber_id is null then
    raise exception 'subscriber_not_found';
  end if;

  select * into v_profile
    from subscriber_profiles
   where subscriber_id = v_subscriber_id;

  -- Primeira criacao: nao consome quota.
  if v_profile.id is null then
    insert into subscriber_profiles
      (subscriber_id, whatsapp, stack, seniority, work_models, location, edits_count, edits_month)
    values
      (v_subscriber_id, p_whatsapp, p_stack, p_seniority, p_work_models, p_location, 0, v_this_month);
    return jsonb_build_object('ok', true, 'created', true,
                              'used', 0, 'limit', v_limit, 'remaining', v_limit);
  end if;

  -- Conta do mes; zera se virou o mes.
  v_used := case
    when v_profile.edits_month is distinct from v_this_month then 0
    else coalesce(v_profile.edits_count, 0)
  end;

  if v_used >= v_limit then
    raise exception 'edit_limit_reached';
  end if;

  update subscriber_profiles set
    whatsapp     = p_whatsapp,
    stack        = p_stack,
    seniority    = p_seniority,
    work_models  = p_work_models,
    location     = p_location,
    edits_count  = v_used + 1,
    edits_month  = v_this_month,
    updated_at   = now()
  where id = v_profile.id;

  return jsonb_build_object('ok', true, 'created', false,
                            'used', v_used + 1, 'limit', v_limit,
                            'remaining', v_limit - (v_used + 1));
end;
$$;

revoke all on function public.save_search_profile(text, text[], seniority_level, text[], text) from public, anon;
grant execute on function public.save_search_profile(text, text[], seniority_level, text[], text) to authenticated;
