-- Demo seed: "Reyes for State Senate" (PA-12). Idempotent. Real Lauderdale Lakes data replaces this.
insert into public.orgs (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Reyes for State Senate')
on conflict (id) do nothing;

insert into public.campaigns (id, org_id, candidate, office, district, election_date)
values ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Mira Reyes', 'State Senate', 'PA-12', '2026-11-03')
on conflict (id) do nothing;

insert into public.voters
  (campaign_id, external_id, first_name, last_name, age, party, precinct, address, city, state, zip, phone, support, persuasion, vote_history, flags)
values
('00000000-0000-0000-0000-000000000010','V-014823','Aaliyah','Henderson',34,'D','07N','2118 Centre Ave, Apt 4B','Pittsburgh','PA','15219','(412) 555-0182',5,0,'{"label":"100% (4/4)"}','{volunteer}'),
('00000000-0000-0000-0000-000000000010','V-014824','Marcus','Whitfield',58,'R','07N','414 Ellsworth Ave','Pittsburgh','PA','15213','(412) 555-0144',1,1,'{"label":"100% (4/4)"}','{}'),
('00000000-0000-0000-0000-000000000010','V-014825','Priya','Raman',29,'I','07N','5500 Walnut St, #312','Pittsburgh','PA','15232','(412) 555-0317',3,4,'{"label":"75% (3/4)"}','{persuadable}'),
('00000000-0000-0000-0000-000000000010','V-014826','Daniel','O''Connor',71,'D','12S','1227 Sheridan Ave','Pittsburgh','PA','15206','(412) 555-0288',4,2,'{"label":"100% (4/4)"}','{VBM}'),
('00000000-0000-0000-0000-000000000010','V-014827','Yuki','Tanaka',41,'D','12S','639 N Negley Ave','Pittsburgh','PA','15206','(412) 555-0119',5,0,'{"label":"100% (4/4)"}','{donor}'),
('00000000-0000-0000-0000-000000000010','V-014828','Brandon','Kim',23,'I','12S','1812 E Carson St','Pittsburgh','PA','15203','(412) 555-0291',3,5,'{"label":"50% (2/4)"}','{persuadable}'),
('00000000-0000-0000-0000-000000000010','V-014829','Helena','Vasquez',67,'D','03W','2240 Beechwood Blvd','Pittsburgh','PA','15217','(412) 555-0204',4,1,'{"label":"100% (4/4)"}','{VBM}'),
('00000000-0000-0000-0000-000000000010','V-014830','Theo','Albright',36,'R','03W','1109 Murray Ave','Pittsburgh','PA','15217','(412) 555-0185',2,3,'{"label":"75% (3/4)"}','{}'),
('00000000-0000-0000-0000-000000000010','V-014831','Imani','Bell',28,'D','03W','5621 Hobart St','Pittsburgh','PA','15217','(412) 555-0173',5,0,'{"label":"100% (4/4)"}','{volunteer,donor}'),
('00000000-0000-0000-0000-000000000010','V-014832','Robert','Petrosian',62,'R','14E','318 Highland Ave','Pittsburgh','PA','15206','(412) 555-0156',1,0,'{"label":"100% (4/4)"}','{}'),
('00000000-0000-0000-0000-000000000010','V-014833','Sofia','Mendoza',45,'I','14E','732 Stanton Ave','Pittsburgh','PA','15201','(412) 555-0263',4,4,'{"label":"75% (3/4)"}','{persuadable}'),
('00000000-0000-0000-0000-000000000010','V-014834','Kenji','Park',31,'D','14E','5031 Penn Ave','Pittsburgh','PA','15224','(412) 555-0298',5,0,'{"label":"75% (3/4)"}','{volunteer}'),
('00000000-0000-0000-0000-000000000010','V-014835','Margaret','Sullivan',78,'R','07N','927 Lincoln Ave','Pittsburgh','PA','15206','(412) 555-0118',2,3,'{"label":"100% (4/4)"}','{}'),
('00000000-0000-0000-0000-000000000010','V-014836','Jamal','Wright',39,'D','12S','1505 W North Ave','Pittsburgh','PA','15233','(412) 555-0144',3,4,'{"label":"50% (2/4)"}','{}'),
('00000000-0000-0000-0000-000000000010','V-014837','Naomi','Eisner',52,'D','03W','5847 Forbes Ave','Pittsburgh','PA','15217','(412) 555-0212',4,2,'{"label":"100% (4/4)"}','{donor}'),
('00000000-0000-0000-0000-000000000010','V-014838','Connor','McLeod',24,'I','14E','224 N Craig St','Pittsburgh','PA','15213','(412) 555-0299',3,5,'{"label":"25% (1/4)"}','{persuadable}'),
('00000000-0000-0000-0000-000000000010','V-014839','Felicia','Brooks',49,'D','07N','320 Atwood St','Pittsburgh','PA','15213','(412) 555-0167',5,0,'{"label":"100% (4/4)"}','{donor}'),
('00000000-0000-0000-0000-000000000010','V-014840','Ethan','Crowley',33,'R','12S','1808 Sarah St','Pittsburgh','PA','15203','(412) 555-0182',2,3,'{"label":"50% (2/4)"}','{}'),
('00000000-0000-0000-0000-000000000010','V-014841','Lucia','Ferrari',27,'D','03W','5128 Bigelow Blvd','Pittsburgh','PA','15213','(412) 555-0234',4,4,'{"label":"50% (2/4)"}','{persuadable}'),
('00000000-0000-0000-0000-000000000010','V-014842','Marcus','Dvořák',64,'I','14E','121 N Pacific Ave','Pittsburgh','PA','15224','(412) 555-0145',3,3,'{"label":"100% (4/4)"}','{persuadable}'),
('00000000-0000-0000-0000-000000000010','V-014843','Eleanor','Pham',70,'D','07N','2300 Bayard St','Pittsburgh','PA','15213','(412) 555-0166',4,1,'{"label":"100% (4/4)"}','{VBM}'),
('00000000-0000-0000-0000-000000000010','V-014844','Trevor','Maddox',19,'I','12S','1409 E Carson St','Pittsburgh','PA','15203','(412) 555-0288',3,5,'{"label":"0% (0/1)"}','{persuadable,new}')
on conflict (campaign_id, external_id) do nothing;
