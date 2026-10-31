-- 课程学习与推荐独立落盘，避免增加机构整包快照的写锁压力；不修改既有业务数据。
CREATE TABLE IF NOT EXISTS parent_course_catalog (
  course_id VARCHAR(100) NOT NULL PRIMARY KEY,
  catalog_version VARCHAR(100) NOT NULL,
  course_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parent_course_learning_events (
  event_id VARCHAR(100) NOT NULL PRIMARY KEY,
  -- 同一秒内连续反馈也必须按实际写入顺序读取，不能按随机UUID推断先后。
  event_sequence BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  institution_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  child_id VARCHAR(100) NOT NULL,
  request_id VARCHAR(120) NOT NULL,
  course_id VARCHAR(100) NOT NULL,
  course_version VARCHAR(100) NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  event_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parent_course_request (institution_id, user_id, request_id),
  KEY idx_parent_course_learning (institution_id, user_id, child_id, created_at)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parent_course_recommendation_jobs (
  job_id VARCHAR(100) NOT NULL PRIMARY KEY,
  institution_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  child_id VARCHAR(100) NOT NULL,
  request_id VARCHAR(120) NOT NULL,
  cache_key CHAR(64) NOT NULL,
  status VARCHAR(30) NOT NULL,
  input_json JSON NOT NULL,
  result_json JSON NULL,
  error_text VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  UNIQUE KEY uq_parent_course_job_request (institution_id, user_id, request_id),
  KEY idx_parent_course_cache (institution_id, user_id, child_id, cache_key, expires_at),
  KEY idx_parent_course_pending (status, updated_at)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS parent_course_semantic_cache (
  cache_key CHAR(64) NOT NULL PRIMARY KEY,
  model_identity VARCHAR(300) NOT NULL,
  dimensions INT NOT NULL,
  vectors_json JSON NOT NULL,
  expires_at TIMESTAMP NOT NULL
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
