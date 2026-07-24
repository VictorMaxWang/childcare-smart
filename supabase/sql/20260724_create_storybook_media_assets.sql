-- Durable storybook media for stateless/serverless deployments.
create table if not exists storybook_media_assets (
  institution_id varchar(191) not null,
  media_key varchar(64) character set ascii collate ascii_bin not null,
  child_id varchar(191) not null,
  storybook_id varchar(191) not null,
  content_type varchar(128) not null,
  media_bytes mediumblob not null,
  byte_length int unsigned not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  primary key (institution_id, media_key),
  key idx_storybook_media_child (institution_id, child_id),
  key idx_storybook_media_storybook (institution_id, storybook_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

