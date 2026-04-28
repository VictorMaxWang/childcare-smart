export const directorReplicaAssets = {
  dashboardCluster: "/pixel-replica/visual-cards/director-dashboard-card-cluster.png",
  aiDecoration: "/pixel-replica/visual-cards/director-ai-decoration-card.png",
  weeklyChartDecoration: "/pixel-replica/charts/weekly-report-chart-decoration.png",
};

export const trendTabs = ["出勤趋势", "健康趋势", "饮食趋势", "成长趋势"];

export const chartLabels = ["05/12", "05/13", "05/14", "05/15", "05/16", "05/17", "05/18"];

export const weeklyTrendSeries = [92, 86, 91, 88, 95, 87, 93];
export const healthTrendSeries = [98, 99, 96, 97, 98, 99, 98];
export const dietTrendSeries = [82, 81, 86, 83, 83, 82, 82];
export const growthTrendSeries = [88, 90, 89, 91, 92, 90, 93];

export const classDistribution = [
  { label: "小一班", value: 26, detail: "28人 (26%)", color: "#635BFF" },
  { label: "小二班", value: 25, detail: "27人 (25%)", color: "#8B5CF6" },
  { label: "中一班", value: 24, detail: "26人 (24%)", color: "#4CC383" },
  { label: "中二班", value: 25, detail: "27人 (25%)", color: "#F7C25B" },
];

export const childArchiveRows = [
  {
    name: "乐乐",
    className: "小一班",
    age: "4岁2月",
    health: "轻微挑食",
    guardian: "林妈妈",
    status: "持续观察",
  },
  {
    name: "小米",
    className: "小二班",
    age: "4岁8月",
    health: "晨检关注",
    guardian: "周爸爸",
    status: "待跟进",
  },
  {
    name: "豆豆",
    className: "中一班",
    age: "5岁1月",
    health: "饮水不足",
    guardian: "陈妈妈",
    status: "处理中",
  },
];

export const weeklyPendingRows = [
  {
    title: "调整儿童饮水计划",
    target: "乐乐",
    priority: "高",
    deadline: "2025/05/21",
    status: "处理中",
    tag: "健康卫生",
  },
  {
    title: "优化户外活动安排",
    target: "全园",
    priority: "中",
    deadline: "2025/05/25",
    status: "待推进",
    tag: "日常照护",
  },
  {
    title: "晨检异常闭环跟进",
    target: "小米",
    priority: "高",
    deadline: "2025/05/19",
    status: "待处理",
    tag: "健康卫生",
  },
];

export const closureSteps = [
  { label: "识别问题", value: "12", status: "已完成" },
  { label: "生成动作", value: "4", status: "已完成" },
  { label: "派单执行", value: "2", status: "进行中" },
  { label: "复盘优化", value: "1.8天", status: "待开始" },
];

export const assignedObjects = [
  { name: "乐乐老师", role: "小一班 主班老师", status: "进行中" },
  { name: "小美老师", role: "中一班 配班老师", status: "已接单" },
  { name: "豆豆老师", role: "保健室 保健老师", status: "进行中" },
  { name: "天天老师", role: "小二班 主班老师", status: "待反馈" },
];

export const aiInsightBullets = [
  "本周整体运营保持稳定，出勤与健康状况良好。",
  "饮食均衡率与活动参与率较上周小幅提升。",
  "建议继续关注个别儿童睡眠与饮水情况。",
];

export const sourceReferences = {
  dashboard:
    "C:\\Users\\12804\\Desktop\\childcare-smart源代码\\前端重构\\smartchildcare_images_part_08_of_08\\images\\smartchildcare_dashboard_for_childcare_management.png",
  dashboardArchive:
    "C:\\Users\\12804\\Desktop\\childcare-smart源代码\\前端重构\\smartchildcare_images_part_03_of_08\\images\\childcare_management_platform_dashboard_ui.png",
  agent:
    "C:\\Users\\12804\\Desktop\\childcare-smart源代码\\前端重构\\smartchildcare_images_part_01_of_08\\images\\ai_powered_childcare_management_dashboard.png",
  weekly:
    "C:\\Users\\12804\\Desktop\\childcare-smart源代码\\前端重构\\smartchildcare_images_part_03_of_08\\images\\childcare_management_dashboard_report_overview.png",
};
