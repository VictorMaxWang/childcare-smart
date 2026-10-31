-- AI 结果不放入机构整包快照，减少锁持有时间并隔离并发收费请求。
create table if not exists ai_result_cache (
  cache_key char(64) not null primary key,
  status enum('pending', 'completed', 'failed', 'unknown') not null,
  owner_token varchar(64) not null,
  response_json json null,
  expires_at datetime(3) not null,
  created_at datetime(3) not null default current_timestamp(3),
  updated_at datetime(3) not null default current_timestamp(3) on update current_timestamp(3),
  index idx_ai_result_expiry (status, expires_at)
) character set utf8mb4 collate utf8mb4_unicode_ci;
