-- MySQL snapshot storage for remote state persistence.
create table if not exists app_state_snapshots (
  institution_id varchar(191) primary key,
  snapshot json not null,
  updated_by varchar(191) null,
  updated_at timestamp not null default current_timestamp on update current_timestamp
);
