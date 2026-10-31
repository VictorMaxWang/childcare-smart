#!/usr/bin/env bash
set -euo pipefail
schema_dir="${1:?Usage: initialize-empty-db.sh /absolute/schema/directory}"
cd "$(dirname "$0")"
mysql_admin() {
  sudo -n docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -u root --default-character-set=utf8mb4 childcare "$@"' sh "$@"
}
table_count="$(mysql_admin -Nse "select count(*) from information_schema.tables where table_schema='childcare'")"
# 手机号 ALTER 非幂等；只允许对已确认的新空库运行，避免覆盖恢复后的历史结构。
if [ "$table_count" != "0" ]; then
  echo "Refusing initialization: database is not empty." >&2
  exit 1
fi
for sql_file in \
  app_users.sql \
  app_state_snapshots.sql \
  20260704_add_phone_normalized_to_app_users.sql \
  20260704_create_consent_records.sql \
  20260724_create_institution_memberships.sql \
  20260724_create_storybook_media_assets.sql \
  20260725_create_admin_notification_events.sql \
  20260726_create_storybook_media_tasks.sql \
  20260726_create_vivo_asr_tasks.sql \
  20260726_create_voice_confirmation_token_consumptions.sql; do
  mysql_admin < "$schema_dir/$sql_file"
  echo "Applied: $sql_file"
done
# 现有三个任务仓库首次访问会执行 IF NOT EXISTS；仅授予这三张表的 CREATE。
mysql_admin <<'SQL'
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'childcare'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON childcare.* TO 'childcare'@'%';
GRANT CREATE ON childcare.storybook_media_tasks TO 'childcare'@'%';
GRANT CREATE ON childcare.vivo_asr_tasks TO 'childcare'@'%';
GRANT CREATE ON childcare.voice_confirmation_token_consumptions TO 'childcare'@'%';
SELECT COUNT(*) AS business_table_count FROM information_schema.tables WHERE table_schema='childcare';
SQL
