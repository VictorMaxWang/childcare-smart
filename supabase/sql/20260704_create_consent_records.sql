-- MySQL consent records for parent-created child onboarding.
create table if not exists consent_records (
  id varchar(191) primary key,
  institution_id varchar(191) not null,
  user_id varchar(191) not null,
  child_id varchar(191) not null,
  consent_type varchar(64) not null,
  policy_version varchar(64) not null,
  agreed_at timestamp not null,
  ip varchar(64) null,
  user_agent varchar(512) null,
  created_at timestamp not null default current_timestamp,
  key idx_consent_records_institution_id (institution_id),
  key idx_consent_records_user_id (user_id),
  key idx_consent_records_child_id (child_id),
  key idx_consent_records_user_child (user_id, child_id)
);
