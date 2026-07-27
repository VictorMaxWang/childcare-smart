-- Vivo ASR 任务按租户、用户、模型、音频摘要和 MIME 类型幂等保存。
-- run-dispatching 表示 /run 可能已经产生计费副作用，因此该状态禁止自动重提。
create table if not exists vivo_asr_tasks (
  task_key char(64) character set ascii collate ascii_bin not null,
  institution_id varchar(191) not null,
  actor_user_id varchar(191) not null,
  provider_model varchar(191) not null,
  audio_digest char(64) character set ascii collate ascii_bin not null,
  mime_type varchar(127) not null,
  request_id char(36) character set ascii collate ascii_bin null,
  session_id char(36) character set ascii collate ascii_bin null,
  task_id varchar(191) null,
  status varchar(32) not null,
  attempt_count tinyint unsigned not null default 0,
  lease_token char(36) character set ascii collate ascii_bin null,
  lease_expires_at datetime(3) null,
  result_json json null,
  last_error_reason varchar(500) null,
  expires_at datetime(3) not null,
  created_at timestamp(3) not null default current_timestamp(3),
  updated_at timestamp(3) not null default current_timestamp(3)
    on update current_timestamp(3),
  primary key (task_key),
  key idx_vivo_asr_task_scope (
    institution_id, actor_user_id
  ),
  key idx_vivo_asr_task_due (
    status, lease_expires_at
  ),
  key idx_vivo_asr_task_expiry (expires_at)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
