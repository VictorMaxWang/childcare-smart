-- MySQL schema for the Agent memory hub.
create table if not exists child_profile_memory (
  id varchar(191) not null,
  child_id varchar(191) not null,
  profile_json json not null,
  version int not null default 1,
  source varchar(64) not null,
  updated_at datetime(3) not null default current_timestamp(3) on update current_timestamp(3),
  primary key (id),
  unique key uq_child_profile_memory_child_id (child_id),
  key idx_child_profile_memory_updated_at (updated_at)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists agent_state_snapshots (
  id varchar(191) not null,
  child_id varchar(191) null,
  session_id varchar(191) null,
  snapshot_type varchar(64) not null,
  input_summary text null,
  snapshot_json json not null,
  created_at datetime(3) not null default current_timestamp(3),
  primary key (id),
  key idx_agent_state_snapshots_child_created (child_id, created_at),
  key idx_agent_state_snapshots_session_created (session_id, created_at),
  key idx_agent_state_snapshots_type_created (snapshot_type, created_at)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists agent_trace_log (
  id varchar(191) not null,
  trace_id varchar(191) not null,
  child_id varchar(191) null,
  session_id varchar(191) null,
  node_name varchar(128) not null,
  action_type varchar(64) not null,
  input_summary text null,
  output_summary text null,
  status varchar(32) not null,
  duration_ms int null,
  metadata_json json null,
  created_at datetime(3) not null default current_timestamp(3),
  primary key (id),
  key idx_agent_trace_log_trace_created (trace_id, created_at),
  key idx_agent_trace_log_child_created (child_id, created_at),
  key idx_agent_trace_log_session_created (session_id, created_at),
  key idx_agent_trace_log_node_created (node_name, created_at)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
