-- Add normalized phone fields for the open phone + password registration phase.
-- This migration keeps username_normalized for legacy account compatibility.

alter table app_users
  add column phone_normalized varchar(32) null comment 'E.164 mainland China phone number, for example +8613800000000',
  add column phone_verified tinyint(1) not null default 0 comment 'Whether the phone number has been verified by a future verification flow',
  add column created_via varchar(32) null default 'phone_password' comment 'Account creation channel for registration analytics and migration safety';

-- MySQL unique indexes allow multiple NULL values, so legacy users without a phone remain valid.
alter table app_users
  add unique key idx_app_users_phone_normalized (phone_normalized);
