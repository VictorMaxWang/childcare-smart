-- Optional legacy mirror for director notification events.
-- Canonical dispatches remain in the task store; this table supports existing
-- deployments during the migration window without request-time schema changes.
create table if not exists admin_notification_events (
  id varchar(191) not null,
  institution_id varchar(191) not null,
  event_type varchar(64) not null,
  status varchar(32) not null default 'pending',
  priority_item_id varchar(191) null,
  title varchar(255) not null,
  summary text not null,
  target_type varchar(32) not null,
  target_id varchar(191) not null,
  target_name varchar(191) not null,
  priority_level varchar(8) not null,
  priority_score int not null default 0,
  recommended_owner_role varchar(32) not null,
  recommended_owner_name varchar(191) null,
  recommended_action text not null,
  recommended_deadline varchar(64) not null,
  reason_text text not null,
  evidence_json longtext null,
  source_json longtext null,
  created_by varchar(191) not null,
  updated_by varchar(191) not null,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp on update current_timestamp,
  completed_at datetime null,
  primary key (id),
  key idx_admin_notification_events_institution (institution_id),
  key idx_admin_notification_events_status (status),
  key idx_admin_notification_events_priority_item (priority_item_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
