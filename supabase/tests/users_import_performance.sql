-- DEMO-only fixtures. Verifies account status, invitation registration, the
-- server-side aggregation and the reviewed import pipeline under real RLS.
begin;
create function public.t_ok(ok boolean,description text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',description; end if; raise notice 'PASS: %',description; end$$;
create function public.t_denied(command text,expected text,description text) returns void language plpgsql as $$declare failed boolean:=false; begin begin execute command; exception when others then if position(expected in sqlerrm)=0 then raise exception 'UNEXPECTED ERROR for %: %',description,sqlerrm; end if; failed:=true; end; perform public.t_ok(failed,description); end$$;
grant execute on function public.t_ok(boolean,text),public.t_denied(text,text,text) to authenticated,anon;
insert into auth.users(id,email) values
('a0000000-0000-0000-0000-000000000001','supervisor@example.test'),
('a0000000-0000-0000-0000-000000000002','manager@example.test'),
('a0000000-0000-0000-0000-000000000003','entry-a@example.test'),
('a0000000-0000-0000-0000-000000000004','viewer@example.test'),
('a0000000-0000-0000-0000-000000000005','invitee@example.test'),
('a0000000-0000-0000-0000-000000000006','entry-b@example.test');
insert into public.administrations(id,name_ar) values ('b0000000-0000-0000-0000-000000000001','DEMO A'),('b0000000-0000-0000-0000-000000000002','DEMO B');
insert into public.user_profiles(user_id,role,administration_id,email) values
('a0000000-0000-0000-0000-000000000001','directorate_supervisor',null,'supervisor@example.test'),
('a0000000-0000-0000-0000-000000000002','program_manager',null,'manager@example.test'),
('a0000000-0000-0000-0000-000000000003','administration_data_entry','b0000000-0000-0000-0000-000000000001','entry-a@example.test'),
('a0000000-0000-0000-0000-000000000004','directorate_viewer',null,'viewer@example.test'),
('a0000000-0000-0000-0000-000000000006','administration_data_entry','b0000000-0000-0000-0000-000000000002','entry-b@example.test');
insert into public.school_years(id,label,starts_on,ends_on) values('c0000000-0000-0000-0000-000000000001','DEMO year',current_date-200,current_date+200);
insert into public.program_versions(id,school_year_id,code,name_ar,version,enabled,grades,indicators) values
('d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','comprehensive','DEMO comprehensive',1,true,'["kg1","primary1","primary4","preparatory1","secondary1"]','["anemia","obesity"]'),
('d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','vision','DEMO vision',1,true,'["kg2"]','["visual_impairment","strabismus","ptosis"]');
create function public.t_week(offset_weeks int default 0) returns date language sql as $$select (now() at time zone 'Africa/Cairo')::date-extract(dow from now() at time zone 'Africa/Cairo')::int-7*offset_weeks$$;
grant execute on function public.t_week(int) to authenticated;
set local role authenticated;

-- Invitations / account administration
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000002';
select public.t_denied($q$select public.register_invited_user('a0000000-0000-0000-0000-000000000005','DEMO Invitee','directorate_viewer')$q$,'FORBIDDEN','program manager cannot invite or grant roles');
select public.t_denied($q$select public.update_user_access('a0000000-0000-0000-0000-000000000003','directorate_viewer',null,'active',null)$q$,'FORBIDDEN','program manager cannot change access');
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000003';
select public.t_denied($q$select public.register_invited_user('a0000000-0000-0000-0000-000000000005','DEMO','directorate_supervisor')$q$,'FORBIDDEN','officer cannot self-escalate through invitations');
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000001';
select public.t_denied($q$select public.register_invited_user('a0000000-0000-0000-0000-000000000005','DEMO Invitee','administration_data_entry')$q$,'ADMINISTRATION_REQUIRED','officer role requires an administration');
select public.t_denied($q$select public.register_invited_user('a0000000-0000-0000-0000-000000000005','DEMO Invitee','directorate_viewer','b0000000-0000-0000-0000-000000000001')$q$,'ADMINISTRATION_REQUIRED','directorate roles cannot be bound to one administration');
select public.t_denied($q$select public.register_invited_user('a0000000-0000-0000-0000-000000000005','DEMO','directorate_admin')$q$,'INVALID_ROLE','legacy admin role cannot be newly granted by invitation');
select public.t_denied($q$select public.register_invited_user(auth.uid(),'DEMO','directorate_viewer')$q$,'CANNOT_CHANGE_OWN_ROLE','supervisor cannot re-register self');
select public.register_invited_user('a0000000-0000-0000-0000-000000000005','DEMO Invitee','administration_data_entry','b0000000-0000-0000-0000-000000000002');
select public.t_ok((select email='invitee@example.test' and full_name='DEMO Invitee' and status='active' and invited_by=auth.uid() from public.user_profiles where user_id='a0000000-0000-0000-0000-000000000005'),'invitation stores name, verified Auth e-mail and inviter');
select public.t_ok((select count(*)=1 from public.audit_log where action='user_invited'),'invitation is audited');
select public.update_user_access('a0000000-0000-0000-0000-000000000005','administration_data_entry','b0000000-0000-0000-0000-000000000002','disabled',null);
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000005';
select public.t_ok(public.app_role() is null,'disabled account has no role');
select public.t_ok((select count(*)=0 from public.administrations),'disabled account reads nothing');
select public.t_denied($q$select public.save_report('b0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001',public.t_week(),'[{"program_version_id":"d0000000-0000-0000-0000-000000000001","sector":"general","grade_code":"kg1","screened":1,"findings":{}}]')$q$,'FORBIDDEN','disabled account cannot write');
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000003';
select public.t_ok((select count(*)=1 from public.user_profiles),'officer reads only own profile');

-- Data: entry A submits weeks; supervisor approves one
select public.save_report('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',public.t_week(),
 '[{"program_version_id":"d0000000-0000-0000-0000-000000000001","sector":"general","grade_code":"kg1","screened":10,"findings":{"anemia":2,"obesity":1}},
   {"program_version_id":"d0000000-0000-0000-0000-000000000001","sector":"azhar","grade_code":"kg1","screened":5,"findings":{"anemia":1}},
   {"program_version_id":"d0000000-0000-0000-0000-000000000002","sector":"general","grade_code":"kg2","screened":7,"findings":{"strabismus":1}}]');
select public.transition_report((select id from public.submission_revisions limit 1),'submit');
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000001';
select public.t_ok((select (public.report_facts('c0000000-0000-0000-0000-000000000001','official')->'facts')='[]'::jsonb),'provisional data not in official facts');
select public.t_ok((select jsonb_array_length(public.report_facts('c0000000-0000-0000-0000-000000000001','pending')->'reports')=1),'provisional data in pending facts');
select public.transition_report((select id from public.submission_revisions limit 1),'approve');
select public.t_ok((select sum((x->>'n')::int)=15 from jsonb_array_elements(public.report_facts('c0000000-0000-0000-0000-000000000001','official')->'facts') x where x->>'p'='comprehensive'),'facts keep sectors separate and sum screened');
select public.t_ok((select sum((x->'f'->>'anemia')::int)=3 from jsonb_array_elements(public.report_facts('c0000000-0000-0000-0000-000000000001','official')->'facts') x),'findings are summed counts');
select public.t_ok((select count(*)=0 from jsonb_array_elements(public.report_facts('c0000000-0000-0000-0000-000000000001','official')->'facts') x where x->>'p'='comprehensive' and x->>'g'='kg2'),'KG2 never appears in comprehensive facts');
select public.t_ok((select jsonb_array_length(public.report_facts('c0000000-0000-0000-0000-000000000001','official',null,null,true,'comprehensive','azhar')->'facts')=1),'facts can be narrowed to one program and sector in SQL');
select public.t_ok((select count(*)=1 from jsonb_array_elements(public.report_facts('c0000000-0000-0000-0000-000000000001','official',null,null,true)->'facts') x where x->>'p'='vision' and x->>'w'=public.t_week()::text),'weekly facts carry the Sunday week');
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000006';
select public.t_ok((select (public.report_facts('c0000000-0000-0000-0000-000000000001','official')->'facts')='[]'::jsonb),'other administration cannot aggregate foreign facts');
select public.t_ok((select jsonb_array_length(public.report_payload('c0000000-0000-0000-0000-000000000001',null,null,null,'','combined','','official')->'lines')=0),'other administration export payload is empty');
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000004';
select public.t_ok((select jsonb_array_length(public.report_payload('c0000000-0000-0000-0000-000000000001',null,null,null,'comprehensive','general','','official')->'lines')=1),'export payload filters program and sector in the database');
select public.t_ok((select jsonb_array_length(public.report_facts('c0000000-0000-0000-0000-000000000001','official')->'facts')=3),'directorate team reads all official facts');

-- Import pipeline
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000004';
select public.t_denied($q$select public.stage_import_batch('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','[{"week":"2026-01-04","program":"comprehensive","sector":"general","grade":"kg1","indicator":"screened","count":1}]','{}')$q$,'FORBIDDEN','directorate team cannot import');
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000003';
select public.t_denied(format($q$select public.stage_import_batch('b0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001','[{"week":"%s","program":"comprehensive","sector":"general","grade":"kg1","indicator":"screened","count":1}]','{}')$q$,public.t_week()),'FORBIDDEN','officer cannot stage another administration');
select public.t_denied(format($q$select public.stage_import_batch('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','[{"week":"%s","program":"comprehensive","sector":"general","grade":"kg2","indicator":"screened","count":1}]','{}')$q$,public.t_week()),'INVALID_IMPORT_CATALOG','import rejects KG2 in comprehensive');
select public.t_denied(format($q$select public.stage_import_batch('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','[{"week":"%1$s","program":"comprehensive","sector":"general","grade":"kg1","indicator":"screened","count":1},{"week":"%1$s","program":"comprehensive","sector":"general","grade":"kg1","indicator":"screened","count":2}]','{}')$q$,public.t_week()),'DUPLICATE_ROWS','duplicate import keys rejected');
select public.t_denied(format($q$select public.stage_import_batch('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','[{"week":"%s","program":"comprehensive","sector":"general","grade":"kg1","indicator":"screened","count":1,"student":"x"}]','{}')$q$,public.t_week()),'INVALID_IMPORT_CATALOG','identifying columns rejected');
select public.t_denied($q$select public.stage_import_batch('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','[]','{"evil":1}')$q$,'TOO_MANY_ROWS','empty batch rejected');
-- Amend this week (azhar kg1 from 5 to 6) and add next sector data for last week.
select public.stage_import_batch('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
 jsonb_build_array(
  jsonb_build_object('week',public.t_week(),'program','comprehensive','sector','azhar','grade','kg1','indicator','screened','count',6),
  jsonb_build_object('week',public.t_week(),'program','comprehensive','sector','azhar','grade','kg1','indicator','anemia','count',2),
  jsonb_build_object('week',public.t_week(),'program','comprehensive','sector','general','grade','primary1','indicator','target','count',900)),
 '{"source_name":"DEMO.xlsx","value_mode":"weekly"}');
select public.t_ok((select status='staged' from public.import_batches),'batch staged only');
select public.t_ok((select count(*)=1 from public.submission_revisions),'staging does not create reports');
select public.promote_import_batch((select id from public.import_batches));
select public.t_ok((select status='promoted' from public.import_batches),'batch promoted');
select public.t_ok((select count(*)=1 from public.submission_revisions where status='draft'),'promotion creates a draft, not an official report');
select public.t_ok((select l.screened=5 from public.report_lines l join public.weekly_submissions s on s.official_revision_id=l.revision_id where l.sector='azhar'),'official number unchanged until approval');
select public.t_ok((select count(*)=3 and sum(screened)=23 from public.report_lines l join public.submission_revisions r on r.id=l.revision_id where r.status='draft'),'draft merges imported rows with the other reported rows');
select public.t_ok((select count(*)=1 from public.target_versions where status='proposed' and target_count=900),'imported target is a proposal only');
select public.t_denied($q$select public.promote_import_batch((select id from public.import_batches))$q$,'INVALID_TRANSITION','promoted batch cannot be promoted twice');
select public.stage_import_batch('b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
 jsonb_build_array(jsonb_build_object('week',public.t_week(3),'program','comprehensive','sector','general','grade','kg1','indicator','screened','count',4)),'{}');
select public.promote_import_batch((select id from public.import_batches where status='staged'));
select public.t_ok((select status='staged' and result->0->>'message' like '%REPORT_LOCKED%' from public.import_batches where created_at=(select max(created_at) from public.import_batches) and rows->0->>'count'='4'),'locked week reported, not forced, for officers');
select public.t_denied($q$select public.discard_import_batch((select id from public.import_batches where status='staged'),'')$q$,'REASON_REQUIRED','discard requires a reason');
select public.discard_import_batch((select id from public.import_batches where status='staged'),'DEMO duplicate file');
select public.t_ok((select count(*)=1 from public.import_batches where status='discarded'),'discarded batch retained for audit');
set local request.jwt.claim.sub='a0000000-0000-0000-0000-000000000006';
select public.t_ok((select count(*)=0 from public.import_batches),'other administration cannot read import batches');
rollback;
