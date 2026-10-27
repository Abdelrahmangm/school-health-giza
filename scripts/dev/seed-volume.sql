-- SYNTHETIC DEMO VOLUME for local performance profiling only. Never run on a real project.
-- Simulates one full school year: 13 administrations x 50 weeks x 2 revisions x 12 lines.
begin;
insert into public.school_years(id,label,starts_on,ends_on) values('9e000000-0000-0000-0000-000000000001','DEMO-volume','2025-09-07','2026-08-29');
insert into public.program_versions(id,school_year_id,code,name_ar,version,enabled,grades,indicators) values
('9e000000-0000-0000-0000-0000000000c1','9e000000-0000-0000-0000-000000000001','comprehensive','DEMO الفحص الشامل',1,true,'["kg1","primary1","primary4","preparatory1","secondary1"]','["anemia","obesity","underweight","dental","hearing"]'),
('9e000000-0000-0000-0000-0000000000c2','9e000000-0000-0000-0000-000000000001','vision','DEMO الإبصار',1,true,'["kg2"]','["visual_impairment","strabismus","ptosis"]');
create temp table demo_actor as select id from auth.users order by created_at limit 1;
insert into public.weekly_submissions(id,administration_id,school_year_id,week_start)
select gen_random_uuid(),a.id,'9e000000-0000-0000-0000-000000000001',date '2025-09-07'+7*w
from public.administrations a cross join generate_series(0,49) w;
insert into public.submission_revisions(id,submission_id,revision_number,status,created_by,submitted_at)
select gen_random_uuid(),s.id,n,case when n=1 then 'superseded' else 'approved' end,(select id from demo_actor),now()
from public.weekly_submissions s cross join generate_series(1,2) n where s.school_year_id='9e000000-0000-0000-0000-000000000001';
update public.weekly_submissions s set official_revision_id=r.id from public.submission_revisions r where r.submission_id=s.id and r.status='approved';
insert into public.report_lines(revision_id,program_version_id,program_code,sector,grade_code,screened,findings)
select r.id,p.id,p.code,sec,g,50+(random()*400)::int,
 (select jsonb_object_agg(i,(random()*20)::int) from jsonb_array_elements_text(p.indicators) i)
from public.submission_revisions r join public.weekly_submissions s on s.id=r.submission_id
cross join public.program_versions p cross join unnest(array['general','azhar']) sec cross join lateral jsonb_array_elements_text(p.grades) g
where p.school_year_id='9e000000-0000-0000-0000-000000000001' and s.school_year_id=p.school_year_id;
insert into public.target_versions(administration_id,program_version_id,school_year_id,program_code,sector,grade_code,target_count,version,status,proposed_by,effective_at)
select a.id,p.id,p.school_year_id,p.code,sec,g,20000,1,'approved',(select id from demo_actor),'2025-09-01'
from public.administrations a cross join public.program_versions p cross join unnest(array['general','azhar']) sec cross join lateral jsonb_array_elements_text(p.grades) g
where p.school_year_id='9e000000-0000-0000-0000-000000000001';
insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
select (select id from demo_actor),'draft_saved','revision',id,jsonb_build_object('lines',jsonb_build_array(1,2,3)) from public.submission_revisions;
commit;
analyze;
