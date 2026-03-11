const fs = require('fs');
let content = fs.readFileSync('app/teacher/page.tsx', 'utf8');

const targetStr = \<div className="flex items-center justify-between w-full">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-100 rounded-2xl">
          <Monitor className="h-8 w-8 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-800">机构端监控大屏</h1>
          <p className="text-sm text-slate-500 mt-1">全局掌控在园幼儿健康、成长情况及家园共育干预成果</p>
          </div>
        </div>\;

const fixedStr = \<div className="flex items-center justify-between w-full flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 rounded-2xl">
            <Monitor className="h-8 w-8 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800">机构端监控大屏</h1>
            <p className="text-sm text-slate-500 mt-1">全局掌控在园幼儿健康、成长情况及家园共育干预成果</p>
          </div>
        </div>\;

content = content.replace(targetStr, fixedStr);
fs.writeFileSync('app/teacher/page.tsx', content, 'utf8');
console.log("Fixed JSX");
