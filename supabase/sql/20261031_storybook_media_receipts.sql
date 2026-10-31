-- 已收费媒体成果的私有回执。只允许媒体任务存储通过task_key、原提交租约和owner scope写入。
-- 独立新表可重复执行；不改现有任务状态，不重建旧表，不把无回执unknown重置成可生成。
CREATE TABLE IF NOT EXISTS storybook_media_receipts (
  task_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  institution_id VARCHAR(191) NOT NULL,
  creator_user_id VARCHAR(191) NOT NULL,
  child_id VARCHAR(191) NOT NULL,
  storybook_id VARCHAR(191) NOT NULL,
  scene_index SMALLINT UNSIGNED NOT NULL,
  channel VARCHAR(16) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  provider_model VARCHAR(191) NOT NULL,
  input_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  result_json LONGBLOB NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (task_key),
  KEY idx_storybook_receipt_scope (institution_id, child_id, storybook_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
