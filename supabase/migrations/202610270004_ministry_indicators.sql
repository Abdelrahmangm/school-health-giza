-- 2026-27 comprehensive screening: new catalog version with the ministry template's
-- 17 indicators (first in ministry column order) plus the extra items tracked in the
-- directorate's original sheets. Append-only: version 1 and all history stay intact.
-- Approved by the directorate owner on 2026-10-27 ("الوزارة + الزيادات").
insert into public.program_versions(school_year_id,code,name_ar,version,enabled,grades,indicators)
select p.school_year_id, p.code, p.name_ar, p.version+1, true, p.grades,
 '["obesity","underweight","stunting","anemia","visual_impairment","dental_caries","skin","inclusion","diabetes","hypertension","heart","epilepsy","asthma","rheumatic_fever","renal","blood_disorders","tumors",
   "thalassemia","favism","dental_diseases","dental_other","glasses","psychological","ent","internal_medicine","urology","neurology","orthopedics","assistive_devices","endemic","speech","motor_disability","other_conditions"]'::jsonb
from public.program_versions p join public.school_years y on y.id=p.school_year_id
where y.label='2026-27' and p.code='comprehensive'
  and p.version=(select max(v.version) from public.program_versions v where v.school_year_id=p.school_year_id and v.code='comprehensive')
  and not (p.indicators ? 'stunting');
insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
select null,'program_version_created','program',p.id,jsonb_build_object('reason','ministry template 2026-27 indicators + directorate sheet items','source_sha256','26d8f19deb50e7f3f1ae72f9e22d0df84e5bde27f4f00c251fc896b8c43bacf8')
from public.program_versions p join public.school_years y on y.id=p.school_year_id
where y.label='2026-27' and p.code='comprehensive' and p.indicators ? 'stunting'
  and not exists(select 1 from public.audit_log a where a.entity_id=p.id and a.action='program_version_created');
