-- Four permission tiers for the Giza school health platform.
-- Legacy directorate_admin remains a temporary equivalent of the supervisor.
-- All checks live in Postgres, never in editable JWT user_metadata.
begin;
alter table public.user_profiles drop constraint if exists user_profiles_role_check;
alter table public.user_profiles add constraint user_profiles_role_check
 check (role in ('directorate_admin','directorate_supervisor','program_manager','directorate_viewer','administration_data_entry'));
create or replace function public.can_access(a uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles where user_id=auth.uid() and (role in ('directorate_admin','directorate_supervisor','program_manager','directorate_viewer') or administration_id=a)) $$;

create or replace function public.can_write(a uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles where user_id=auth.uid() and (role in ('directorate_admin','directorate_supervisor','program_manager') or (role='administration_data_entry' and administration_id=a))) $$;

create or replace function public.assert_editor(s public.weekly_submissions) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.can_write(s.administration_id),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not coalesce(public.app_role() in ('directorate_admin','directorate_supervisor','program_manager'),false) and now()>=greatest(public.report_deadline(s.week_start),coalesce(s.reopened_until,'-infinity'::timestamptz)) then raise exception 'REPORT_LOCKED'; end if;
end $$;

create or replace function public.save_program(y uuid,c text,n text,e boolean,g jsonb,ind jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; v int;
begin
 if not coalesce(public.app_role() in ('directorate_admin','directorate_supervisor','program_manager'),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if g is null or ind is null or length(trim(n))=0 or length(n)>150 or jsonb_typeof(g)<>'array' or jsonb_array_length(g)=0 or jsonb_typeof(ind)<>'array' or exists(select 1 from jsonb_array_elements(g) x where jsonb_typeof(x)<>'string' or (x #>> '{}') !~ '^[a-z][a-z0-9_]{0,49}$') or exists(select 1 from jsonb_array_elements(ind) x where jsonb_typeof(x)<>'string' or (x #>> '{}') !~ '^[a-z][a-z0-9_]{0,49}$') then raise exception 'INVALID_CATALOG'; end if;
 if (select label from public.school_years where id=y)='2026-27' and ((c='comprehensive' and g <> '["kg1","primary1","primary4","preparatory1","secondary1"]'::jsonb) or (c='vision' and (g <> '["kg2"]'::jsonb or ind <> '["visual_impairment","strabismus","ptosis"]'::jsonb))) then raise exception 'PROTECTED_2026_RULES'; end if;
 perform pg_advisory_xact_lock(hashtextextended(y::text||c,0));
 select coalesce(max(version),0)+1 into v from public.program_versions where school_year_id=y and code=c;
 insert into public.program_versions(school_year_id,code,name_ar,version,enabled,grades,indicators) values(y,c,n,v,e,g,ind) returning id into result;
 perform public.record_audit('program_version_created','program',result); return result;
end $$;

create or replace function public.create_school_year(l text,s date,e date) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 if not coalesce(public.app_role() in ('directorate_admin','directorate_supervisor','program_manager'),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 insert into public.school_years(label,starts_on,ends_on) values(l,s,e) returning id into result;
 perform public.record_audit('year_created','school_year',result); return result; end $$;

create or replace function public.transition_report(r uuid,action text,comment text default '') returns void language plpgsql security definer set search_path='' as $$
declare s public.weekly_submissions; rev public.submission_revisions;
begin
 select s1.* into s from public.weekly_submissions s1 join public.submission_revisions v on v.submission_id=s1.id where v.id=r for update of s1;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into rev from public.submission_revisions where id=r for update;
 if action='submit' then
   perform public.assert_editor(s);
   if rev.status not in ('draft','needs_correction') then raise exception 'INVALID_TRANSITION'; end if;
   -- Validate current catalog again so a disabled version cannot be submitted from an old draft.
   if exists(select 1 from public.report_lines l join public.program_versions p on p.id=l.program_version_id where l.revision_id=r and (not p.enabled or p.version<>(select max(v.version) from public.program_versions v where v.school_year_id=p.school_year_id and v.code=p.code))) then raise exception 'STALE_PROGRAM_VERSION'; end if;
   update public.submission_revisions set status='provisional',submitted_at=now() where id=r;
 elsif action in ('approve','return') then
   if not coalesce(public.app_role() in ('directorate_admin','directorate_supervisor','program_manager'),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
   if rev.status<>'provisional' then raise exception 'INVALID_TRANSITION'; end if;
   if action='return' and length(trim(comment))=0 then raise exception 'REASON_REQUIRED'; end if;
   if action='approve' then
     update public.submission_revisions set status='superseded' where id=s.official_revision_id;
     update public.submission_revisions set status='approved',reviewed_at=now(),reviewed_by=auth.uid(),review_comment=comment where id=r;
     update public.weekly_submissions set official_revision_id=r where id=s.id;
   else
     update public.submission_revisions set status='needs_correction',reviewed_at=now(),reviewed_by=auth.uid(),review_comment=comment where id=r;
   end if;
 else raise exception 'INVALID_ACTION'; end if;
 perform public.record_audit(action,'revision',r,jsonb_build_object('comment',comment,'previous_status',rev.status));
end $$;

create or replace function public.reopen_report(sid uuid,until_at timestamptz,reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.app_role() in ('directorate_admin','directorate_supervisor','program_manager'),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if length(trim(reason))=0 or until_at<=now() or until_at>now()+interval '7 days' then raise exception 'INVALID_REOPEN'; end if;
 update public.weekly_submissions set reopened_until=until_at,reopen_reason=reason where id=sid;
 if not found then raise exception 'NOT_FOUND'; end if;
 perform public.record_audit('reopened','submission',sid,jsonb_build_object('until',until_at,'reason',reason)); end $$;

create or replace function public.review_target(tid uuid,approve boolean,comment text default '') returns void language plpgsql security definer set search_path='' as $$
declare t public.target_versions;
begin
 if not coalesce(public.app_role() in ('directorate_admin','directorate_supervisor','program_manager'),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into t from public.target_versions where id=tid;
 if not found then raise exception 'NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtextextended(t.administration_id::text||t.school_year_id::text||t.program_code||t.sector||t.grade_code,0));
 select * into t from public.target_versions where id=tid for update;
 if t.status<>'proposed' then raise exception 'INVALID_TRANSITION'; end if;
 if not approve and length(trim(comment))=0 then raise exception 'REASON_REQUIRED'; end if;
 if approve then
   update public.target_versions set status='superseded' where administration_id=t.administration_id and school_year_id=t.school_year_id and program_code=t.program_code and sector=t.sector and grade_code=t.grade_code and status='approved';
 end if;
 update public.target_versions set status=case when approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),effective_at=case when approve then now() end,review_comment=comment where id=tid;
 perform public.record_audit(case when approve then 'target_approved' else 'target_rejected' end,'target',tid,jsonb_build_object('comment',comment)); end $$;

create or replace function public.assign_role(uid uuid,new_role text,a uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.app_role() in ('directorate_admin','directorate_supervisor'),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if uid=auth.uid() then raise exception 'CANNOT_CHANGE_OWN_ROLE'; end if;
 insert into public.user_profiles(user_id,role,administration_id) values(uid,new_role,a) on conflict(user_id) do update set role=excluded.role,administration_id=excluded.administration_id;
 perform public.record_audit('role_assigned','user',uid,jsonb_build_object('role',new_role,'administration_id',a)); end $$;

create or replace function public.create_report_snapshot(y uuid,a uuid,w_from date,w_to date,p text,sec text,g text,m text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; payload jsonb; scope jsonb;
begin
 if (a is null and not coalesce(public.app_role() in ('directorate_admin','directorate_supervisor','program_manager'),false)) or (a is not null and not coalesce(public.can_write(a),false)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if sec not in ('general','azhar','combined') or m not in ('official','pending') or not exists(select 1 from public.school_years where id=y) or (w_from is not null and extract(dow from w_from)<>0) or (w_to is not null and extract(dow from w_to)<>0) or (w_from is not null and w_to is not null and w_from>w_to) then raise exception 'INVALID_FILTERS'; end if;
 scope:=jsonb_build_object('year',y,'administration',coalesce(a::text,''),'from',coalesce(w_from::text,''),'to',coalesce(w_to::text,''),'program',p,'sector',sec,'grade',coalesce(g,''),'mode',m,'asOf',case when w_to is null then now() else (w_to+6+time '23:59:59.999') at time zone 'Africa/Cairo' end);
 with s as materialized(select * from public.weekly_submissions where school_year_id=y and (a is null or administration_id=a) and (w_from is null or week_start>=w_from) and (w_to is null or week_start<=w_to)),
 r as materialized(select v.* from public.submission_revisions v join s on s.id=v.submission_id where (m='official' and v.id=s.official_revision_id) or (m='pending' and v.status='provisional'))
 select jsonb_build_object(
 'submissions',coalesce((select jsonb_agg(s) from s),'[]'),
 'revisions',coalesce((select jsonb_agg(r) from r),'[]'),
 'lines',coalesce((select jsonb_agg(l) from public.report_lines l join r on r.id=l.revision_id where (p='' or l.program_code=p) and (sec='combined' or l.sector=sec) and (coalesce(g,'')='' or l.grade_code=g)),'[]'),
 'targets',coalesce((select jsonb_agg(t) from public.target_versions t where t.school_year_id=y and (a is null or t.administration_id=a) and t.status in ('approved','superseded')),'[]'),
 'administrations',coalesce((select jsonb_agg(ad) from public.administrations ad where a is null or ad.id=a),'[]'),
 'years',coalesce((select jsonb_agg(sy) from public.school_years sy where sy.id=y),'[]')) into payload;
 if octet_length(payload::text)>5000000 then raise exception 'SNAPSHOT_TOO_LARGE'; end if;
 insert into public.report_snapshots(administration_id,created_by,filters,payload) values(a,auth.uid(),scope,payload) returning id into result;
 perform public.record_audit('snapshot_created','snapshot',result,scope); return result;
end $$;
drop policy if exists read_profiles on public.user_profiles;
create policy read_profiles on public.user_profiles for select to authenticated
 using(user_id=auth.uid() or public.app_role() in ('directorate_admin','directorate_supervisor','program_manager'));
drop policy if exists read_audit on public.audit_log;
create policy read_audit on public.audit_log for select to authenticated
 using(public.app_role() in ('directorate_admin','directorate_supervisor','program_manager'));
drop policy if exists read_snapshots on public.report_snapshots;
create policy read_snapshots on public.report_snapshots for select to authenticated
 using((administration_id is null and public.app_role() in ('directorate_admin','directorate_supervisor','program_manager','directorate_viewer')) or (administration_id is not null and public.can_access(administration_id)));
commit;
