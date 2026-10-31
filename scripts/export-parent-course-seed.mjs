import { CARE_COURSES, COURSE_CATALOG_VERSION, safeBilibiliUrl } from "../lib/courses/catalog.ts";

// 只输出公开课程元数据，不读取环境文件、账号或数据库；可交给独立管理身份导入。
const literal = (value) => `CONVERT(0x${Buffer.from(value, "utf8").toString("hex")} USING utf8mb4)`;
for (const course of CARE_COURSES) {
  if (!safeBilibiliUrl(course.video.url)) throw new Error("Invalid course source");
  console.log(`INSERT INTO parent_course_catalog (course_id,catalog_version,course_json) VALUES (${literal(course.id)},${literal(COURSE_CATALOG_VERSION)},${literal(JSON.stringify(course))}) ON DUPLICATE KEY UPDATE catalog_version=VALUES(catalog_version),course_json=VALUES(course_json);`);
}
