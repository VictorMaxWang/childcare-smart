-- 绘本图片与语音任务使用独立行，保证跨实例幂等、租约和有限重试。
create table if not exists storybook_media_tasks (
  task_key char(64) character set ascii collate ascii_bin not null,
  institution_id varchar(191) not null,
  actor_user_id varchar(191) not null,
  child_id varchar(191) not null,
  storybook_id varchar(191) not null,
  scene_index smallint unsigned not null,
  channel varchar(16) not null,
  provider varchar(64) not null,
  provider_model varchar(191) not null,
  input_digest char(64) character set ascii collate ascii_bin not null,
  task_id varchar(191) null,
  status varchar(32) not null,
  attempt_count smallint unsigned not null default 0,
  poll_error_count smallint unsigned not null default 0,
  submitted_at datetime(3) null,
  next_retry_at datetime(3) null,
  media_key char(40) character set ascii collate ascii_bin null,
  lease_token char(36) character set ascii collate ascii_bin null,
  lease_expires_at datetime(3) null,
  last_error_reason varchar(500) null,
  created_at timestamp(3) not null default current_timestamp(3),
  updated_at timestamp(3) not null default current_timestamp(3)
    on update current_timestamp(3),
  primary key (task_key),
  key idx_storybook_media_task_scope (
    institution_id, child_id, storybook_id
  ),
  key idx_storybook_media_task_due (
    status, next_retry_at, lease_expires_at
  ),
  key idx_storybook_media_task_media (
    institution_id, media_key
  ),
  key idx_storybook_media_task_updated (updated_at)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
