const fs = require('fs');
const path = 'app/teacher/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. imports
content = content.replace(
  'Activity, Monitor } from "lucide-react";',
  'Activity, Monitor, Wifi, Thermometer, HeartPulse } from "lucide-react";\nimport { useState, useEffect } from "react";'
);
content = content.replace(
  'import { useStore } from "@/lib/store";',
  'import { useStore } from "@/lib/store";'
);

// 2. Add real-time mock states inside the component
content = content.replace(
  'const todayFeedbacks = guardianFeedbacks.filter((r) => r.date === todayStr);',
  'const todayFeedbacks = guardianFeedbacks.filter((r) => r.date === todayStr);\n\n  // IoT Mocks\n  const [envTemp, setEnvTemp] = useState(24.5);\n\n  useEffect(() => {\n    const timer = setInterval(() => {\n      setEnvTemp(prev => Number((prev + (Math.random() - 0.5) * 0.2).toFixed(1)));\n    }, 3000);\n    return () => clearInterval(timer);\n  }, []);'
);

// 3. Add UI badge for IoT
content = content.replace(
  '<div className="flex items-center gap-3">',
  '<div className="flex items-center justify-between w-full">\n        <div className="flex flex-col gap-1">\n          <div className="flex items-center gap-3">'
);
content = content.replace(
  '<p className="text-sm text-slate-500 mt-1">全局掌控在园幼儿健康、成长情况及家园共育干预成果</p>\n        </div>',
  '<p className="text-sm text-slate-500 mt-1">全局掌控在园幼儿健康、成长情况及家园共育干预成果</p>\n          </div>\n        </div>\n\n        {/* IoT Mock Panel */}\n        <div className="hidden lg:flex items-center gap-4 bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl">\n          <div className="flex items-center gap-2">\n            <span className="relative flex h-2.5 w-2.5">\n              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>\n              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>\n            </span>\n            <span className="text-xs font-medium text-slate-600">IoT网关在线</span>\n          </div>\n          <div className="w-[1px] h-4 bg-slate-200"></div>\n          <div className="flex items-center gap-1.5 text-xs text-slate-600">\n            <Wifi className="w-3.5 h-3.5 text-indigo-400" />\n            智能手环活跃: {totalChildren}/{totalChildren}\n          </div>\n          <div className="w-[1px] h-4 bg-slate-200"></div>\n          <div className="flex items-center gap-1.5 text-xs text-slate-600">\n            <Thermometer className="w-3.5 h-3.5 text-orange-400" />\n            室温均值: {envTemp}C\n          </div>\n        </div>\n      </div>'
);

fs.writeFileSync(path, content, 'utf8');
console.log("IoT Patch applied");
