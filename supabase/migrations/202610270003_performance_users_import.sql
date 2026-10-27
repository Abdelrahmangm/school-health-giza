-- Additive migration: performance (RLS init-plans, indexes, server-side aggregation),
-- user identity/status for invitations, and a reviewed Excel/CSV import pipeline.
-- No existing table, column, rule, calculation or history is removed.
begin;

-- ---------------------------------------------------------------------------
-- 1. User identity and account status
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists full_name text check (full_name is null or length(full_name) between 2 and 120),
  add column if not exists email text check (email is null or length(email) <= 254),
  add column if not exists status text not null default 'active' check (status in ('active','disabled')),
  add column if not exists invited_by uuid references auth.users,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists user_profiles_email_unique on public.user_profiles (lower(email)) where email is not null;

-- A disabled account keeps its history but has no role, so every RLS policy denies it.
create or replace function public.app_role() returns text language sql stable security definer set search_path='' as $$
  select role from public.user_profiles where user_id=auth.uid() and status='active' $$;
create or replace function public.can_access(a uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_profiles where user_id=auth.uid() and status='active' and (role in ('directorate_admin','directorate_supervisor','program_manager','directorate_viewer') or administration_id=a)) $$;
create or replace function public.can_write(a uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_profiles where user_id=auth.uid() and status='active' and (role in ('directorate_admin','directorate_supervisor','program_manager') or (role='administration_data_entry' and administration_id=a))) $$;

-- Row-independent helpers. Policies call them inside (select ...) so PostgreSQL
-- evaluates them once per query (InitPlan) instead of once per row.
create function public.sees_all_administrations() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(public.app_role() in ('directorate_admin','directorate_supervisor','program_manager','directorate_viewer'),false) $$;
create function public.is_operator() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(public.app_role() in ('directorate_admin','directorate_supervisor','program_manager'),false) $$;
create function public.is_supervisor() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(public.app_role() in ('directorate_admin','directorate_supervisor'),false) $$;
create function public.my_administration() returns uuid language sql stable security definer set search_path='' as $$
  select administration_id from public.user_profiles where user_id=auth.uid() and status='active' and role='administration_data_entry' $$;

-- ---------------------------------------------------------------------------
-- 2. Same permissions, cheaper policies
-- ---------------------------------------------------------------------------
drop policy read_administrations on public.administrations;
create policy read_administrations on public.administrations for select to authenticated
  using ((select public.sees_all_administrations()) or id=(select public.my_administration()));
drop policy read_profiles on public.user_profiles;
create policy read_profiles on public.user_profiles for select to authenticated
  using (user_id=(select auth.uid()) or (select public.is_operator()));
drop policy read_years on public.school_years;
create policy read_years on public.school_years for select to authenticated using ((select public.app_role()) is not null);
drop policy read_programs on public.program_versions;
create policy read_programs on public.program_versions for select to authenticated using ((select public.app_role()) is not null);
drop policy read_submissions on public.weekly_submissions;
create policy read_submissions on public.weekly_submissions for select to authenticated
  using ((select public.sees_all_administrations()) or administration_id=(select public.my_administration()));
drop policy read_revisions on public.submission_revisions;
create policy read_revisions on public.submission_revisions for select to authenticated
  using (exists(select 1 from public.weekly_submissions s where s.id=submission_id)
         and ((select public.app_role())<>'directorate_viewer' or status not in ('draft','needs_correction')));
drop policy read_targets on public.target_versions;
create policy read_targets on public.target_versions for select to authenticated
  using ((select public.sees_all_administrations()) or administration_id=(select public.my_administration()));
drop policy read_audit on public.audit_log;
create policy read_audit on public.audit_log for select to authenticated using ((select public.is_operator()));
drop policy read_imports on public.import_batches;
create policy read_imports on public.import_batches for select to authenticated
  using ((select public.is_operator()) or administration_id=(select public.my_administration()));

create index if not exists weekly_submissions_year_week on public.weekly_submissions (school_year_id, week_start);
create index if not exists submission_revisions_submission_status on public.submission_revisions (submission_id, status);
create index if not exists target_versions_year_admin on public.target_versions (school_year_id, administration_id);
create index if not exists audit_log_at on public.audit_log (at desc, id desc);

-- ---------------------------------------------------------------------------
-- 3. Server-side aggregation (SECURITY INVOKER: the caller's RLS applies)
-- Same rules as lib/domain.ts aggregate(): official = official pointer only,
-- pending = provisional revision only; findings are summed counts, never children.
-- ---------------------------------------------------------------------------
create function public.report_facts(y uuid, m text, w_from date default null, w_to date default null, by_week boolean default false, prog text default null, sec text default null)
returns jsonb language sql stable security invoker set search_path='' as $$
with s as (
  select id, administration_id, week_start, official_revision_id from public.weekly_submissions
  where school_year_id=y and (w_from is null or week_start>=w_from) and (w_to is null or week_start<=w_to)
), sel as (
  select s.administration_id a, s.week_start w, r.id rid
  from s join public.submission_revisions r on r.submission_id=s.id
  where (m='official' and r.id=s.official_revision_id) or (m='pending' and r.status='provisional')
), l as (
  select sel.a, case when by_week then sel.w end w, l.program_code p, l.sector sc, l.grade_code g, l.screened, l.findings
  from sel join public.report_lines l on l.revision_id=sel.rid
  where (prog is null or l.program_code=prog) and (sec is null or sec='combined' or l.sector=sec)
), f as (
  select a,w,p,sc,g,sum(screened)::bigint n from l group by 1,2,3,4,5
), fk as (
  select a,w,p,sc,g,jsonb_object_agg(k,c) fs from (
    select a,w,p,sc,g,e.key k,sum((e.value)::bigint) c from l, jsonb_each_text(l.findings) e group by 1,2,3,4,5,6
  ) x group by 1,2,3,4,5
)
select jsonb_build_object(
  'facts', coalesce((select jsonb_agg(jsonb_build_object('a',f.a,'w',f.w,'p',f.p,'s',f.sc,'g',f.g,'n',f.n,'f',coalesce(fk.fs,'{}'::jsonb)))
                     from f left join fk on fk.a=f.a and fk.p=f.p and fk.sc=f.sc and fk.g=f.g and fk.w is not distinct from f.w),'[]'::jsonb),
  'reports', coalesce((select jsonb_agg(jsonb_build_object('a',a,'w',w)) from sel),'[]'::jsonb)
) $$;


-- Read-only export payload with the same shape as report_snapshots.payload, filtered in
-- the database instead of downloading whole tables (SECURITY INVOKER: RLS applies).
create function public.report_payload(y uuid,a uuid,w_from date,w_to date,p text,sec text,g text,m text)
returns jsonb language sql stable security invoker set search_path='' as $$
 with s as materialized(select * from public.weekly_submissions where school_year_id=y and (a is null or administration_id=a) and (w_from is null or week_start>=w_from) and (w_to is null or week_start<=w_to)),
 r as materialized(select v.* from public.submission_revisions v join s on s.id=v.submission_id where (m='official' and v.id=s.official_revision_id) or (m='pending' and v.status='provisional'))
 select jsonb_build_object(
 'submissions',coalesce((select jsonb_agg(s) from s),'[]'),
 'revisions',coalesce((select jsonb_agg(r) from r),'[]'),
 'lines',coalesce((select jsonb_agg(l) from public.report_lines l join r on r.id=l.revision_id where (coalesce(p,'')='' or l.program_code=p) and (sec='combined' or l.sector=sec) and (coalesce(g,'')='' or l.grade_code=g)),'[]'),
 'targets',coalesce((select jsonb_agg(t) from public.target_versions t where t.school_year_id=y and (a is null or t.administration_id=a) and t.status in ('approved','superseded')),'[]'),
 'administrations',coalesce((select jsonb_agg(ad) from public.administrations ad where a is null or ad.id=a),'[]'),
 'years',coalesce((select jsonb_agg(sy) from public.school_years sy where sy.id=y),'[]')) $$;

-- ---------------------------------------------------------------------------
-- 4. Invitations and account administration (General Supervisor only)
-- The server action sends the e-mail through Supabase Auth; the permission
-- itself is written here, under the supervisor's own session, never via user_metadata.
-- ---------------------------------------------------------------------------
create function public.register_invited_user(uid uuid, name text, new_role text, a uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare mail text;
begin
  if not public.is_supervisor() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if uid=auth.uid() then raise exception 'CANNOT_CHANGE_OWN_ROLE'; end if;
  if new_role not in ('directorate_supervisor','program_manager','directorate_viewer','administration_data_entry') then raise exception 'INVALID_ROLE'; end if;
  if (new_role='administration_data_entry') <> (a is not null) then raise exception 'ADMINISTRATION_REQUIRED_FOR_OFFICER_ONLY'; end if;
  if name is null or length(trim(name)) not between 2 and 120 then raise exception 'INVALID_NAME'; end if;
  select u.email into mail from auth.users u where u.id=uid;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.user_profiles(user_id,role,administration_id,full_name,email,status,invited_by)
  values(uid,new_role,a,trim(name),lower(mail),'active',auth.uid())
  on conflict(user_id) do update set role=excluded.role,administration_id=excluded.administration_id,full_name=excluded.full_name,
    email=excluded.email,status='active',updated_at=now();
  perform public.record_audit('user_invited','user',uid,jsonb_build_object('role',new_role,'administration_id',a));
end $$;

create function public.update_user_access(uid uuid, new_role text, a uuid, new_status text, name text) returns void
language plpgsql security definer set search_path='' as $$
declare old public.user_profiles;
begin
  if not public.is_supervisor() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if uid=auth.uid() then raise exception 'CANNOT_CHANGE_OWN_ROLE'; end if;
  if new_role not in ('directorate_supervisor','program_manager','directorate_viewer','administration_data_entry','directorate_admin') then raise exception 'INVALID_ROLE'; end if;
  if (new_role='administration_data_entry') <> (a is not null) then raise exception 'ADMINISTRATION_REQUIRED_FOR_OFFICER_ONLY'; end if;
  if new_status not in ('active','disabled') then raise exception 'INVALID_STATUS'; end if;
  if name is not null and length(trim(name)) not between 2 and 120 then raise exception 'INVALID_NAME'; end if;
  select * into old from public.user_profiles where user_id=uid for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.user_profiles set role=new_role, administration_id=a, status=new_status,
    full_name=coalesce(nullif(trim(name),''),full_name), updated_at=now() where user_id=uid;
  perform public.record_audit('user_access_updated','user',uid,jsonb_build_object(
    'before',jsonb_build_object('role',old.role,'administration_id',old.administration_id,'status',old.status),
    'after',jsonb_build_object('role',new_role,'administration_id',a,'status',new_status)));
end $$;

-- Legacy role assignment keeps working, but now also respects account status.
create or replace function public.assign_role(uid uuid,new_role text,a uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_supervisor() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if uid=auth.uid() then raise exception 'CANNOT_CHANGE_OWN_ROLE'; end if;
 insert into public.user_profiles(user_id,role,administration_id) values(uid,new_role,a) on conflict(user_id) do update set role=excluded.role,administration_id=excluded.administration_id,updated_at=now();
 perform public.record_audit('role_assigned','user',uid,jsonb_build_object('role',new_role,'administration_id',a)); end $$;

-- ---------------------------------------------------------------------------
-- 5. Reviewed import pipeline: stage -> reconcile -> promote to DRAFT -> normal submit/approve
-- ---------------------------------------------------------------------------
alter table public.import_batches
  add column if not exists status text not null default 'staged' check (status in ('staged','partial','promoted','discarded')),
  add column if not exists source_name text check (source_name is null or length(source_name) <= 200),
  add column if not exists source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'),
  add column if not exists options jsonb not null default '{}' check (jsonb_typeof(options)='object'),
  add column if not exists result jsonb,
  add column if not exists reviewed_by uuid references auth.users,
  add column if not exists reviewed_at timestamptz,
  add column if not exists school_year_id uuid references public.school_years;
create index if not exists import_batches_admin_created on public.import_batches (administration_id, created_at desc);

create function public.import_row_valid(x jsonb, y uuid) returns boolean language sql stable security definer set search_path='' as $$
  select jsonb_typeof(x)='object'
    and coalesce((select array_agg(k order by k) from jsonb_object_keys(x) k),'{}') = array['count','grade','indicator','program','sector','week']::text[]
    and jsonb_typeof(x->'count')='number' and x->>'count' ~ '^[0-9]+$' and (x->>'count')::numeric <= 10000000
    and x->>'sector' in ('general','azhar') and x->>'week' ~ '^\d{4}-\d{2}-\d{2}$' and x->>'indicator' ~ '^[a-z][a-z0-9_]{0,49}$'
    and extract(dow from (x->>'week')::date)=0
    and exists(select 1 from public.program_versions p join public.school_years y on y.id=p.school_year_id
      where y.id=import_row_valid.y and (x->>'week')::date between y.starts_on and y.ends_on and p.enabled and p.code=x->>'program' and p.grades ? (x->>'grade')
        and (x->>'indicator' in ('screened','target') or p.indicators ? (x->>'indicator'))
        and p.version=(select max(v.version) from public.program_versions v where v.school_year_id=p.school_year_id and v.code=p.code)) $$;

create function public.stage_import_batch(a uuid, y uuid, data jsonb, meta jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not coalesce(public.can_write(a),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if data is null or jsonb_typeof(data)<>'array' or jsonb_array_length(data)=0 or jsonb_array_length(data)>5000 then raise exception 'TOO_MANY_ROWS'; end if;
  if meta is null or jsonb_typeof(meta)<>'object' or exists(select 1 from jsonb_object_keys(meta) k where k not in ('source_name','source_sha256','value_mode','week_rule','sheet')) then raise exception 'INVALID_META'; end if;
  -- Only whitelisted aggregate fields are ever stored; any name/ID column is rejected.
  if exists(select 1 from jsonb_array_elements(data) x where not public.import_row_valid(x,y)) then raise exception 'INVALID_IMPORT_CATALOG'; end if;
  if exists(select 1 from jsonb_array_elements(data) x group by x->>'week',x->>'program',x->>'sector',x->>'grade',x->>'indicator' having count(*)>1) then raise exception 'DUPLICATE_ROWS'; end if;
  insert into public.import_batches(administration_id,school_year_id,created_by,rows,warnings,source_name,source_sha256,options)
  values(a,y,auth.uid(),data,'[]',left(meta->>'source_name',200),meta->>'source_sha256',meta - 'source_name' - 'source_sha256')
  returning id into result;
  perform public.record_audit('import_staged','import',result,jsonb_build_object('rows',jsonb_array_length(data),'source',meta->>'source_name','sha256',meta->>'source_sha256'));
  return result;
end $$;

create function public.discard_import_batch(b uuid, reason text) returns void language plpgsql security definer set search_path='' as $$
declare t public.import_batches;
begin
  select * into t from public.import_batches where id=b for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not coalesce(public.can_write(t.administration_id),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if t.status not in ('staged','partial') then raise exception 'INVALID_TRANSITION'; end if;
  if reason is null or length(trim(reason))=0 then raise exception 'REASON_REQUIRED'; end if;
  update public.import_batches set status='discarded',reviewed_by=auth.uid(),reviewed_at=now(),result=jsonb_build_object('reason',reason) where id=b;
  perform public.record_audit('import_discarded','import',b,jsonb_build_object('reason',reason));
end $$;

-- Turns a staged batch into DRAFT weekly reports (never provisional, never approved)
-- and target PROPOSALS. Each week runs in its own subtransaction so one locked or
-- conflicting week is reported without hiding the others. Re-running is idempotent.
create function public.promote_import_batch(b uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.import_batches; wk date; yr uuid; sub public.weekly_submissions; active public.submission_revisions;
  base jsonb; incoming jsonb; merged jsonb; rid uuid; results jsonb:='[]'; ok int:=0; bad int:=0; tr record; pid uuid; existing int;
begin
  select * into t from public.import_batches where id=b for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not coalesce(public.can_write(t.administration_id),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if t.status not in ('staged','partial') then raise exception 'INVALID_TRANSITION'; end if;
  if t.school_year_id is null then raise exception 'LEGACY_BATCH_RESTAGE_REQUIRED'; end if;
  for wk in select distinct (x->>'week')::date from jsonb_array_elements(t.rows) x where x->>'indicator'<>'target' order by 1 loop
    begin
      yr:=t.school_year_id;
      -- Lines from the file: one per program/sector/grade, findings keyed by indicator.
      select jsonb_agg(jsonb_build_object('program_version_id',pv.id,'sector',g.sector,'grade_code',g.grade,'screened',g.screened,'findings',g.findings))
        into incoming
      from (
        select x->>'program' program, x->>'sector' sector, x->>'grade' grade,
          max(case when x->>'indicator'='screened' then (x->>'count')::int end) screened,
          coalesce(jsonb_object_agg(x->>'indicator',(x->>'count')::int) filter (where x->>'indicator' not in ('screened','target')),'{}'::jsonb) findings
        from jsonb_array_elements(t.rows) x where (x->>'week')::date=wk and x->>'indicator'<>'target' group by 1,2,3
      ) g join lateral (select p.id from public.program_versions p where p.school_year_id=yr and p.code=g.program order by p.version desc limit 1) pv on true;
      if incoming is null or exists(select 1 from jsonb_array_elements(incoming) e where e.value->'screened' is null or e.value->'screened'='null'::jsonb) then raise exception 'SCREENED_REQUIRED'; end if;
      select * into sub from public.weekly_submissions where administration_id=t.administration_id and school_year_id=yr and week_start=wk;
      active:=null; base:='[]';
      if sub.id is not null then
        if exists(select 1 from public.submission_revisions where submission_id=sub.id and status='provisional') then raise exception 'PENDING_REVIEW_EXISTS'; end if;
        select * into active from public.submission_revisions where submission_id=sub.id and status in ('draft','needs_correction');
        -- Keep the other program/sector/grade rows already reported (draft first, otherwise official).
        select coalesce(jsonb_agg(jsonb_build_object('program_version_id',pv.id,'sector',l.sector,'grade_code',l.grade_code,'screened',l.screened,'findings',l.findings)),'[]')
          into base
        from public.report_lines l join lateral (select p.id from public.program_versions p where p.school_year_id=yr and p.code=l.program_code order by p.version desc limit 1) pv on true
        where l.revision_id=coalesce(active.id,sub.official_revision_id);
      end if;
      select coalesce(jsonb_agg(z.line),'[]') into merged from (
        select b.value line from jsonb_array_elements(base) b
        where not exists(select 1 from jsonb_array_elements(incoming) i where i.value->>'program_version_id'=b.value->>'program_version_id' and i.value->>'sector'=b.value->>'sector' and i.value->>'grade_code'=b.value->>'grade_code')
        union all select i.value from jsonb_array_elements(incoming) i) z;
      rid:=public.save_report(t.administration_id,yr,wk,merged,active.id);
      ok:=ok+1;
      results:=results||jsonb_build_object('week',wk,'status',case when active.id is null then 'draft_created' else 'draft_updated' end,'revision_id',rid);
    exception when others then
      bad:=bad+1;
      results:=results||jsonb_build_object('week',wk,'status','error','message',sqlerrm);
    end;
  end loop;
  -- Annual targets become proposals only; they never enter official totals without approval.
  for tr in select distinct on (x->>'program',x->>'sector',x->>'grade') x->>'program' program,x->>'sector' sector,x->>'grade' grade,(x->>'count')::int cnt,(x->>'week')::date wk
            from jsonb_array_elements(t.rows) x where x->>'indicator'='target' order by x->>'program',x->>'sector',x->>'grade',(x->>'week')::date desc loop
    begin
      select p.id into pid from public.program_versions p where p.school_year_id=t.school_year_id and p.code=tr.program order by p.version desc limit 1;
      select count(*) into existing from public.target_versions v join public.program_versions p on p.id=pid
        where v.administration_id=t.administration_id and v.school_year_id=p.school_year_id and v.program_code=tr.program and v.sector=tr.sector
          and v.grade_code=tr.grade and v.status in ('approved','proposed') and v.target_count=tr.cnt;
      if existing=0 then
        perform public.propose_target(t.administration_id,pid,tr.sector,tr.grade,tr.cnt);
        results:=results||jsonb_build_object('target',tr.program||'/'||tr.sector||'/'||tr.grade,'status','target_proposed','count',tr.cnt);
      else
        results:=results||jsonb_build_object('target',tr.program||'/'||tr.sector||'/'||tr.grade,'status','target_unchanged','count',tr.cnt);
      end if;
      ok:=ok+1;
    exception when others then
      bad:=bad+1;
      results:=results||jsonb_build_object('target',tr.program||'/'||tr.sector||'/'||tr.grade,'status','error','message',sqlerrm);
    end;
  end loop;
  update public.import_batches set status=case when bad=0 then 'promoted' when ok>0 then 'partial' else t.status end,
    result=results,reviewed_by=auth.uid(),reviewed_at=now() where id=b;
  perform public.record_audit('import_promoted','import',b,jsonb_build_object('succeeded',ok,'failed',bad));
  return results;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: new entry points only; internal helpers stay private.
-- ---------------------------------------------------------------------------
revoke execute on function public.sees_all_administrations(),public.is_operator(),public.is_supervisor(),public.my_administration(),
  public.report_facts(uuid,text,date,date,boolean,text,text),public.report_payload(uuid,uuid,date,date,text,text,text,text),public.register_invited_user(uuid,text,text,uuid),
  public.update_user_access(uuid,text,uuid,text,text),public.import_row_valid(jsonb,uuid),public.stage_import_batch(uuid,uuid,jsonb,jsonb),
  public.discard_import_batch(uuid,text),public.promote_import_batch(uuid) from public,anon;
grant execute on function public.sees_all_administrations(),public.is_operator(),public.is_supervisor(),public.my_administration(),
  public.report_facts(uuid,text,date,date,boolean,text,text),public.report_payload(uuid,uuid,date,date,text,text,text,text),public.register_invited_user(uuid,text,text,uuid),
  public.update_user_access(uuid,text,uuid,text,text),public.stage_import_batch(uuid,uuid,jsonb,jsonb),
  public.discard_import_batch(uuid,text),public.promote_import_batch(uuid) to authenticated;
commit;
