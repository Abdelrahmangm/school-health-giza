-- Fresh TEST Supabase project only. Root 0001_core.sql is a historical reference;
-- do not apply both schemas. No personal health data is stored.
begin;
create extension if not exists pgcrypto;
create table public.administrations(id uuid primary key default gen_random_uuid(), name_ar text not null unique);
create table public.user_profiles(user_id uuid primary key references auth.users(id) on delete cascade, role text not null check(role in ('directorate_admin','directorate_viewer','administration_data_entry')), administration_id uuid references public.administrations, check((role='administration_data_entry')=(administration_id is not null)));
create table public.school_years(id uuid primary key default gen_random_uuid(), label text unique not null, starts_on date not null, ends_on date not null, check(ends_on>starts_on));
create table public.program_versions(id uuid primary key default gen_random_uuid(), school_year_id uuid not null references public.school_years, code text not null check(code ~ '^[a-z][a-z0-9_]{0,49}$'), name_ar text not null, version int not null check(version>0), enabled boolean not null, grades jsonb not null check(jsonb_typeof(grades)='array'), indicators jsonb not null check(jsonb_typeof(indicators)='array'), created_at timestamptz not null default now(), unique(school_year_id,code,version));
create table public.weekly_submissions(id uuid primary key default gen_random_uuid(), administration_id uuid not null references public.administrations, school_year_id uuid not null references public.school_years, week_start date not null check(extract(dow from week_start)=0), official_revision_id uuid, reopened_until timestamptz, reopen_reason text, created_at timestamptz not null default now(), unique(administration_id,school_year_id,week_start));
create table public.submission_revisions(id uuid primary key default gen_random_uuid(), submission_id uuid not null references public.weekly_submissions, revision_number int not null, status text not null default 'draft' check(status in ('draft','provisional','approved','needs_correction','superseded')), created_by uuid not null references auth.users, submitted_at timestamptz, reviewed_at timestamptz, reviewed_by uuid references auth.users, review_comment text, created_at timestamptz not null default now(), unique(submission_id,revision_number), unique(submission_id,id));
alter table public.weekly_submissions add constraint official_belongs_to_submission foreign key(id,official_revision_id) references public.submission_revisions(submission_id,id);
create unique index one_approved_revision on public.submission_revisions(submission_id) where status='approved';
create unique index one_active_revision on public.submission_revisions(submission_id) where status in ('draft','provisional','needs_correction');
create table public.report_lines(id uuid primary key default gen_random_uuid(), revision_id uuid not null references public.submission_revisions on delete cascade, program_version_id uuid not null references public.program_versions, program_code text not null, sector text not null check(sector in ('general','azhar')), grade_code text not null, screened int not null check(screened between 0 and 10000000), findings jsonb not null default '{}' check(jsonb_typeof(findings)='object'), unique(revision_id,program_code,sector,grade_code));
create table public.target_versions(id uuid primary key default gen_random_uuid(), administration_id uuid not null references public.administrations, program_version_id uuid not null references public.program_versions, school_year_id uuid not null references public.school_years, program_code text not null, sector text not null check(sector in ('general','azhar')), grade_code text not null, target_count int not null check(target_count between 0 and 10000000), version int not null, status text not null default 'proposed' check(status in ('proposed','approved','rejected','superseded')), proposed_by uuid not null references auth.users, reviewed_by uuid references auth.users, effective_at timestamptz, review_comment text, created_at timestamptz not null default now(), unique(administration_id,school_year_id,program_code,sector,grade_code,version));
create unique index one_approved_target on public.target_versions(administration_id,school_year_id,program_code,sector,grade_code) where status='approved';
create table public.audit_log(id bigint generated always as identity primary key, actor_id uuid references auth.users, action text not null, entity_type text not null, entity_id uuid, details jsonb not null default '{}', at timestamptz not null default now());
create table public.import_batches(id uuid primary key default gen_random_uuid(), administration_id uuid not null references public.administrations, created_by uuid not null references auth.users, rows jsonb not null check(jsonb_typeof(rows)='array'), warnings jsonb not null, created_at timestamptz not null default now());
create table public.report_snapshots(id uuid primary key default gen_random_uuid(), administration_id uuid references public.administrations, created_by uuid not null references auth.users, filters jsonb not null, payload jsonb not null, created_at timestamptz not null default now());
create table public.ministry_mappings(id uuid primary key default gen_random_uuid(), school_year_id uuid not null references public.school_years, version int not null, columns jsonb not null, verified boolean not null default false, source_sha256 text, unique(school_year_id,version));

create function public.app_role() returns text language sql stable security definer set search_path='' as $$ select role from public.user_profiles where user_id=auth.uid() $$;
create function public.can_access(a uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles where user_id=auth.uid() and (role in ('directorate_admin','directorate_viewer') or administration_id=a)) $$;
create function public.can_write(a uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.user_profiles where user_id=auth.uid() and (role='directorate_admin' or (role='administration_data_entry' and administration_id=a))) $$;
create function public.report_deadline(w date) returns timestamptz language sql immutable set search_path='' as $$ select (w+7+time '16:00') at time zone 'Africa/Cairo' $$;
create function public.assert_editor(s public.weekly_submissions) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.can_write(s.administration_id),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if public.app_role()<>'directorate_admin' and now()>=greatest(public.report_deadline(s.week_start),coalesce(s.reopened_until,'-infinity'::timestamptz)) then raise exception 'REPORT_LOCKED'; end if;
end $$;
create function public.record_audit(a text,t text,i uuid,d jsonb default '{}') returns void language sql security definer set search_path='' as $$ insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),a,t,i,d) $$;

-- Catalog versions are append-only, including disabled versions; old years remain intact.
create function public.save_program(y uuid,c text,n text,e boolean,g jsonb,ind jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; v int;
begin
 if public.app_role() is distinct from 'directorate_admin' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if g is null or ind is null or length(trim(n))=0 or length(n)>150 or jsonb_typeof(g)<>'array' or jsonb_array_length(g)=0 or jsonb_typeof(ind)<>'array' or exists(select 1 from jsonb_array_elements(g) x where jsonb_typeof(x)<>'string' or (x #>> '{}') !~ '^[a-z][a-z0-9_]{0,49}$') or exists(select 1 from jsonb_array_elements(ind) x where jsonb_typeof(x)<>'string' or (x #>> '{}') !~ '^[a-z][a-z0-9_]{0,49}$') then raise exception 'INVALID_CATALOG'; end if;
 if (select label from public.school_years where id=y)='2026-27' and ((c='comprehensive' and g <> '["kg1","primary1","primary4","preparatory1","secondary1"]'::jsonb) or (c='vision' and (g <> '["kg2"]'::jsonb or ind <> '["visual_impairment","strabismus","ptosis"]'::jsonb))) then raise exception 'PROTECTED_2026_RULES'; end if;
 perform pg_advisory_xact_lock(hashtextextended(y::text||c,0));
 select coalesce(max(version),0)+1 into v from public.program_versions where school_year_id=y and code=c;
 insert into public.program_versions(school_year_id,code,name_ar,version,enabled,grades,indicators) values(y,c,n,v,e,g,ind) returning id into result;
 perform public.record_audit('program_version_created','program',result); return result;
end $$;
create function public.create_school_year(l text,s date,e date) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 if public.app_role() is distinct from 'directorate_admin' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 insert into public.school_years(label,starts_on,ends_on) values(l,s,e) returning id into result;
 perform public.record_audit('year_created','school_year',result); return result; end $$;

create function public.replace_lines(r uuid, data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare entry jsonb; p public.program_versions; y uuid; f record;
begin
 if data is null or jsonb_typeof(data)<>'array' or jsonb_array_length(data)=0 or jsonb_array_length(data)>500 then raise exception 'INVALID_LINES'; end if;
 select s.school_year_id into y from public.weekly_submissions s join public.submission_revisions v on v.submission_id=s.id where v.id=r;
 delete from public.report_lines where revision_id=r;
 for entry in select * from jsonb_array_elements(data) loop
   if jsonb_typeof(entry)<>'object' or coalesce((select array_agg(k order by k) from jsonb_object_keys(entry) k),'{}') <> array['findings','grade_code','program_version_id','screened','sector']::text[] or jsonb_typeof(entry->'screened')<>'number' then raise exception 'INVALID_LINE_FIELDS'; end if;
   select * into p from public.program_versions where id=(entry->>'program_version_id')::uuid and school_year_id=y;
   if not found or not p.enabled or not (p.grades ? (entry->>'grade_code')) then raise exception 'INVALID_PROGRAM_GRADE'; end if;
   if p.version <> (select max(version) from public.program_versions where school_year_id=y and code=p.code) then raise exception 'STALE_PROGRAM_VERSION'; end if;
   if jsonb_typeof(entry->'findings') is distinct from 'object' or (entry->>'screened') !~ '^[0-9]+$' then raise exception 'INVALID_COUNTS'; end if;
   for f in select * from jsonb_each(entry->'findings') loop
     if not (p.indicators ? f.key) or jsonb_typeof(f.value)<>'number' or f.value::text !~ '^[0-9]+$' or (f.value::text)::numeric>(entry->>'screened')::numeric then raise exception 'INVALID_FINDING'; end if;
   end loop;
   insert into public.report_lines(revision_id,program_version_id,program_code,sector,grade_code,screened,findings) values(r,p.id,p.code,entry->>'sector',entry->>'grade_code',(entry->>'screened')::int,entry->'findings');
 end loop;
end $$;
create function public.save_report(a uuid,y uuid,w date,data jsonb,r uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.weekly_submissions; rev public.submission_revisions; result uuid; n int;
begin
 if not coalesce(public.can_write(a),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if w>(now() at time zone 'Africa/Cairo')::date or not exists(select 1 from public.school_years where id=y and w between starts_on and ends_on) then raise exception 'INVALID_YEAR_WEEK'; end if;
 insert into public.weekly_submissions(administration_id,school_year_id,week_start) values(a,y,w) on conflict(administration_id,school_year_id,week_start) do nothing;
 select * into s from public.weekly_submissions where administration_id=a and school_year_id=y and week_start=w for update;
 perform public.assert_editor(s);
 if r is null then
   select coalesce(max(revision_number),0)+1 into n from public.submission_revisions where submission_id=s.id;
   insert into public.submission_revisions(submission_id,revision_number,created_by) values(s.id,n,auth.uid()) returning id into result;
 else
   select * into rev from public.submission_revisions where id=r and submission_id=s.id for update;
   if not found or rev.status not in ('draft','needs_correction') then raise exception 'NOT_EDITABLE'; end if;
   result:=r;
 end if;
 perform public.replace_lines(result,data);
 perform public.record_audit('draft_saved','revision',result,jsonb_build_object('lines',data)); return result;
end $$;
create function public.transition_report(r uuid,action text,comment text default '') returns void language plpgsql security definer set search_path='' as $$
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
   if public.app_role() is distinct from 'directorate_admin' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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
create function public.reopen_report(sid uuid,until_at timestamptz,reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.app_role() is distinct from 'directorate_admin' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if length(trim(reason))=0 or until_at<=now() or until_at>now()+interval '7 days' then raise exception 'INVALID_REOPEN'; end if;
 update public.weekly_submissions set reopened_until=until_at,reopen_reason=reason where id=sid;
 if not found then raise exception 'NOT_FOUND'; end if;
 perform public.record_audit('reopened','submission',sid,jsonb_build_object('until',until_at,'reason',reason)); end $$;
create function public.propose_target(a uuid,pid uuid,sec text,g text,cnt int) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.program_versions; result uuid; v int;
begin
 if not coalesce(public.can_write(a),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into p from public.program_versions where id=pid;
 if not found or not p.enabled or not (p.grades ? g) or p.version<>(select max(version) from public.program_versions where school_year_id=p.school_year_id and code=p.code) then raise exception 'INVALID_PROGRAM_GRADE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||p.school_year_id::text||p.code||sec||g,0));
 select coalesce(max(version),0)+1 into v from public.target_versions where administration_id=a and school_year_id=p.school_year_id and program_code=p.code and sector=sec and grade_code=g;
 insert into public.target_versions(administration_id,program_version_id,school_year_id,program_code,sector,grade_code,target_count,version,proposed_by) values(a,pid,p.school_year_id,p.code,sec,g,cnt,v,auth.uid()) returning id into result;
 perform public.record_audit('target_proposed','target',result); return result; end $$;
create function public.review_target(tid uuid,approve boolean,comment text default '') returns void language plpgsql security definer set search_path='' as $$
declare t public.target_versions;
begin
 if public.app_role() is distinct from 'directorate_admin' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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
create function public.assign_role(uid uuid,new_role text,a uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.app_role() is distinct from 'directorate_admin' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if uid=auth.uid() then raise exception 'CANNOT_CHANGE_OWN_ROLE'; end if;
 insert into public.user_profiles(user_id,role,administration_id) values(uid,new_role,a) on conflict(user_id) do update set role=excluded.role,administration_id=excluded.administration_id;
 perform public.record_audit('role_assigned','user',uid,jsonb_build_object('role',new_role,'administration_id',a)); end $$;
create function public.stage_import(a uuid,data jsonb,w jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 if not coalesce(public.can_write(a),false) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if data is null or jsonb_typeof(data)<>'array' or jsonb_array_length(data)=0 or jsonb_array_length(data)>500 then raise exception 'TOO_MANY_ROWS'; end if;
 -- Store only strictly whitelisted aggregate fields; never raw CSV or arbitrary text.
 if exists(select 1 from jsonb_array_elements(data) x where jsonb_typeof(x)<>'object' or coalesce((select array_agg(k order by k) from jsonb_object_keys(x) k),'{}') <> array['count','grade','indicator','program','sector','week']::text[] or jsonb_typeof(x->'count')<>'number' or x->>'count' !~ '^[0-9]+$' or x->>'sector' not in ('general','azhar') or x->>'program' not in ('comprehensive','vision') or x->>'grade' not in ('kg1','kg2','primary1','primary4','preparatory1','secondary1') or x->>'indicator' !~ '^[a-z_]{1,50}$' or x->>'week' !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'INVALID_IMPORT'; end if;
 if exists(select 1 from jsonb_array_elements(data) x where not exists(select 1 from public.program_versions p join public.school_years y on y.id=p.school_year_id where (x->>'week')::date between y.starts_on and y.ends_on and extract(dow from (x->>'week')::date)=0 and p.enabled and p.code=x->>'program' and p.grades ? (x->>'grade') and (x->>'indicator'='screened' or p.indicators ? (x->>'indicator')) and p.version=(select max(v.version) from public.program_versions v where v.school_year_id=p.school_year_id and v.code=p.code)) or (x->>'count')::numeric>10000000) then raise exception 'INVALID_IMPORT_CATALOG'; end if;
 insert into public.import_batches(administration_id,created_by,rows,warnings) values(a,auth.uid(),data,'[]') returning id into result;
 perform public.record_audit('import_staged','import',result); return result; end $$;

create function public.create_report_snapshot(y uuid,a uuid,w_from date,w_to date,p text,sec text,g text,m text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; payload jsonb; scope jsonb;
begin
 if (a is null and public.app_role() is distinct from 'directorate_admin') or (a is not null and not coalesce(public.can_write(a),false)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
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

-- No direct client INSERT/UPDATE/DELETE. Mutations use the narrowly granted RPCs.
do $$ declare t text; begin foreach t in array array['administrations','user_profiles','school_years','program_versions','weekly_submissions','submission_revisions','report_lines','target_versions','audit_log','import_batches','report_snapshots','ministry_mappings'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy read_administrations on public.administrations for select to authenticated using(public.can_access(id));
create policy read_profiles on public.user_profiles for select to authenticated using(user_id=auth.uid() or public.app_role()='directorate_admin');
create policy read_years on public.school_years for select to authenticated using(public.app_role() is not null);
create policy read_programs on public.program_versions for select to authenticated using(public.app_role() is not null);
create policy read_submissions on public.weekly_submissions for select to authenticated using(public.can_access(administration_id));
create policy read_revisions on public.submission_revisions for select to authenticated using(exists(select 1 from public.weekly_submissions s where s.id=submission_id and public.can_access(s.administration_id)) and (public.app_role()<>'directorate_viewer' or status not in ('draft','needs_correction')));
create policy read_lines on public.report_lines for select to authenticated using(exists(select 1 from public.submission_revisions r where r.id=revision_id));
create policy read_targets on public.target_versions for select to authenticated using(public.can_access(administration_id));
create policy read_audit on public.audit_log for select to authenticated using(public.app_role()='directorate_admin');
create policy read_imports on public.import_batches for select to authenticated using(public.can_write(administration_id));
create policy read_snapshots on public.report_snapshots for select to authenticated using((administration_id is null and public.app_role() in ('directorate_admin','directorate_viewer')) or (administration_id is not null and public.can_access(administration_id)));
create policy read_mappings on public.ministry_mappings for select to authenticated using(public.app_role() is not null and verified);
revoke all on all tables in schema public from anon,authenticated;
grant select on public.administrations,public.user_profiles,public.school_years,public.program_versions,public.weekly_submissions,public.submission_revisions,public.report_lines,public.target_versions,public.audit_log,public.import_batches,public.report_snapshots,public.ministry_mappings to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.app_role(),public.can_access(uuid),public.can_write(uuid),public.report_deadline(date) to authenticated;
grant execute on function public.save_report(uuid,uuid,date,jsonb,uuid),public.transition_report(uuid,text,text),public.reopen_report(uuid,timestamptz,text),public.propose_target(uuid,uuid,text,text,int),public.review_target(uuid,boolean,text),public.save_program(uuid,text,text,boolean,jsonb,jsonb),public.create_school_year(text,date,date),public.assign_role(uuid,text,uuid),public.stage_import(uuid,jsonb,jsonb),public.create_report_snapshot(uuid,uuid,date,date,text,text,text,text) to authenticated;

-- Reference data only: no users, reports, patient information or demo counts.
insert into public.administrations(name_ar) select unnest(array['أوسيم','كرداسة','البدرشين','الصف','أطفيح','أبو النمرس','شرق القناطر','غرب القناطر','شمال العياط','جنوب العياط','الوراق','الحوامدية','الواحات']);
insert into public.school_years(label,starts_on,ends_on) values('2026-27','2026-09-01','2027-08-31');
insert into public.program_versions(school_year_id,code,name_ar,version,enabled,grades,indicators) select id,'comprehensive','الفحص الطبي الشامل',1,true,'["kg1","primary1","primary4","preparatory1","secondary1"]','["anemia","obesity","underweight","dental","hearing"]' from public.school_years;
insert into public.program_versions(school_year_id,code,name_ar,version,enabled,grades,indicators) select id,'vision','فحص الإبصار — رياض أطفال ثانية',1,true,'["kg2"]','["visual_impairment","strabismus","ptosis"]' from public.school_years;
commit;
