-- One-time consumption ledger for signed voice-assistant write confirmations.
-- The application may create this table as a short deployment compatibility fallback,
-- but release validation requires this migration to exist before production acceptance.

create table if not exists voice_confirmation_token_consumptions (
  token_hash char(64) character set ascii collate ascii_bin not null,
  institution_id varchar(191) not null,
  user_id varchar(191) not null,
  child_id varchar(191) null,
  command_id varchar(191) not null,
  intent varchar(64) not null,
  expires_at datetime(3) not null,
  consumed_at datetime(3) not null,
  primary key (token_hash),
  key idx_voice_confirmation_expires_at (expires_at)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
