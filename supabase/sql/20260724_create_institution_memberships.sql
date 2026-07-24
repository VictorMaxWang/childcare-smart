-- Canonical institution membership and account-binding control plane.
-- Existing app_users and snapshot fields remain compatibility projections during migration.

create table if not exists institutions (
  id varchar(191) primary key,
  status varchar(32) not null default 'active',
  created_by varchar(191) not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp
);

create table if not exists institution_classes (
  id varchar(191) primary key,
  institution_id varchar(191) not null,
  name varchar(100) not null,
  status varchar(32) not null default 'active',
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key idx_institution_classes_institution_name (institution_id, name),
  unique key idx_institution_classes_institution_id_id (institution_id, id),
  constraint fk_institution_classes_institution
    foreign key (institution_id) references institutions (id)
);

create table if not exists institution_memberships (
  user_id varchar(191) primary key,
  institution_id varchar(191) not null,
  role varchar(32) not null,
  class_id varchar(191) null,
  status varchar(32) not null default 'active',
  authz_version bigint not null default 1,
  created_by varchar(191) not null,
  joined_at timestamp not null default current_timestamp,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key idx_institution_memberships_institution_user (institution_id, user_id),
  key idx_institution_memberships_institution_role (institution_id, role),
  key idx_institution_memberships_class (institution_id, class_id),
  constraint fk_institution_memberships_user
    foreign key (user_id) references app_users (id),
  constraint fk_institution_memberships_institution
    foreign key (institution_id) references institutions (id),
  constraint fk_institution_memberships_class
    foreign key (institution_id, class_id)
    references institution_classes (institution_id, id)
);

create table if not exists teacher_class_assignments (
  user_id varchar(191) primary key,
  institution_id varchar(191) not null,
  class_id varchar(191) not null,
  status varchar(32) not null default 'active',
  assigned_by varchar(191) not null,
  assigned_at timestamp not null default current_timestamp,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  key idx_teacher_class_assignments_class (institution_id, class_id),
  constraint fk_teacher_class_assignments_membership
    foreign key (institution_id, user_id)
    references institution_memberships (institution_id, user_id),
  constraint fk_teacher_class_assignments_class
    foreign key (institution_id, class_id)
    references institution_classes (institution_id, id)
);

create table if not exists child_registry (
  child_id varchar(191) primary key,
  institution_id varchar(191) not null,
  class_id varchar(191) not null,
  status varchar(32) not null default 'active',
  created_by varchar(191) not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key idx_child_registry_institution_child (institution_id, child_id),
  key idx_child_registry_class (institution_id, class_id),
  constraint fk_child_registry_institution
    foreign key (institution_id) references institutions (id),
  constraint fk_child_registry_class
    foreign key (institution_id, class_id)
    references institution_classes (institution_id, id)
);

create table if not exists guardian_child_links (
  institution_id varchar(191) not null,
  user_id varchar(191) not null,
  child_id varchar(191) not null,
  status varchar(32) not null default 'active',
  created_by varchar(191) not null,
  linked_at timestamp not null default current_timestamp,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  primary key (user_id, child_id),
  key idx_guardian_child_links_institution_child (institution_id, child_id),
  constraint fk_guardian_child_links_membership
    foreign key (institution_id, user_id)
    references institution_memberships (institution_id, user_id),
  constraint fk_guardian_child_links_child
    foreign key (institution_id, child_id)
    references child_registry (institution_id, child_id)
);

create table if not exists member_invitations (
  id varchar(191) primary key,
  institution_id varchar(191) not null,
  target_role varchar(32) not null,
  class_id varchar(191) not null,
  class_name varchar(100) not null,
  teacher_id varchar(191) null,
  code_hash char(64) not null,
  status varchar(32) not null default 'pending',
  created_by varchar(191) not null,
  expires_at timestamp not null,
  accepted_by varchar(191) null,
  accepted_at timestamp null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  unique key idx_member_invitations_code_hash (code_hash),
  key idx_member_invitations_institution_status (institution_id, status),
  constraint fk_member_invitations_institution
    foreign key (institution_id) references institutions (id),
  constraint fk_member_invitations_class
    foreign key (institution_id, class_id)
    references institution_classes (institution_id, id)
);

create table if not exists authorization_audit_events (
  id varchar(191) primary key,
  institution_id varchar(191) not null,
  actor_user_id varchar(191) not null,
  subject_user_id varchar(191) not null,
  action varchar(64) not null,
  metadata json not null,
  created_at timestamp not null default current_timestamp,
  key idx_authorization_audit_events_institution_created
    (institution_id, created_at),
  key idx_authorization_audit_events_subject
    (subject_user_id, created_at),
  constraint fk_authorization_audit_events_institution
    foreign key (institution_id) references institutions (id)
);
