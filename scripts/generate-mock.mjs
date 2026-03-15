import fs from 'fs';

const NAMES = ["陈子昂", "李沐宸", "张依诺", "王梓瑜", "刘佳怡", "赵梓轩", "黄语桐", "周浩轩", "吴雨桐", "孙可馨", "徐皓轩", "马伊诺", "朱俊熙", "胡子萱", "郭梓睿", "何瑾瑜", "高梦琪", "林子涵", "郑宇辰", "梁奕辰"];
const GENDERS = ["男", "男", "女", "女", "女", "男", "女", "男", "女", "女", "男", "女", "男", "女", "男", "女", "女", "女", "男", "男"];

let extraChildren = `\n// 自动扩展出的20条演示数据\nconst EXTRA_GEN_CHILDREN: Child[] = [\n`;
NAMES.forEach((name, i) => {
  const isBoy = GENDERS[i] === "男";
  extraChildren += `  {
    id: "c-${i + 17}",
    name: "${name}",
    nickname: "${name.slice(1)}",
    birthDate: "2022-0${Math.floor(Math.random()*8)+1}-1${Math.floor(Math.random()*8)}",
    gender: "${GENDERS[i]}",
    allergies: ${Math.random() < 0.2 ? '["芒果"]' : '[]'},
    heightCm: ${Math.floor(Math.random()*20) + 90},
    weightKg: ${(Math.random()*5 + 13).toFixed(1)},
    guardians: [{ name: "${name[0]}${isBoy?'爸爸':'妈妈'}", relation: "${isBoy?'父亲':'母亲'}", phone: "138****${1000+i*7}" }],
    institutionId: "inst-1",
    className: ${i%2===0 ? '"向阳班"' : '"晨曦班"'},
    specialNotes: "已适应托育环境。",
    avatar: "${isBoy ? '👦' : '👧'}",
  },\n`;
});
extraChildren += `];\n`;

let extraMeals = `const EXTRA_GEN_MEALS: MealRecord[] = [];\n
EXTRA_GEN_CHILDREN.forEach((child) => {
  DEMO_WEEK_DATES.forEach((date, i) => {
    EXTRA_GEN_MEALS.push(
      createMealRecord(\`m-\${child.id}-lunch-\${i+1}\`, child.id, date, "午餐", 
        [["米饭", "主食", "1碗"], ["鸡肉", "蛋白", "60g"], ["青菜", "蔬果", "50g"]],
        150 + (i % 5)*5, "正常", "李老师", "教师", "适中")
    );
  });
});\n`;

let extraAttendance = `const EXTRA_GEN_ATTENDANCE: AttendanceRecord[] = [];\n
EXTRA_GEN_CHILDREN.forEach((child) => {
  DEMO_WEEK_DATES.forEach((date, i) => {
    EXTRA_GEN_ATTENDANCE.push({
      id: \`a-\${child.id}-\${i+1}\`,
      childId: child.id,
      date,
      isPresent: true,
      checkInAt: \`08:\${20 + i % 10}\`,
      checkOutAt: \`17:\${10 + i % 10}\`,
    });
  });
});\n`;

let extraHealth = `const EXTRA_GEN_HEALTH_CHECKS: HealthCheckRecord[] = [];\n
EXTRA_GEN_CHILDREN.forEach((child) => {
  DEMO_WEEK_DATES.forEach((date, i) => {
    EXTRA_GEN_HEALTH_CHECKS.push(
      createHealthRecord(\`hc-\${child.id}-\${i+1}\`, child.id, date, 36.5 + (i%3)*0.1, "平稳", "状态良好", "李老师", "教师")
    );
  });
});\n`;

fs.writeFileSync('lib/store_extras.txt', extraChildren + extraMeals + extraAttendance + extraHealth);
