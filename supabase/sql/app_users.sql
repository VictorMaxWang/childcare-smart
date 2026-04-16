-- MySQL schema for application users.
create table if not exists app_users (
  id varchar(191) primary key,
  username_normalized varchar(191) not null,
  display_name varchar(255) not null,
  password_hash varchar(255) not null,
  role varchar(32) not null,
  avatar varchar(255) null,
  institution_id varchar(191) not null,
  class_name varchar(255) null,
  child_ids json not null default (json_array()),
  is_demo boolean not null default false,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key idx_app_users_username_normalized (username_normalized),
  key idx_app_users_institution_id (institution_id)
);
