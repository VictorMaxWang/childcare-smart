const fs = require('fs');
const path = 'app/parent/page.tsx';
let content = fs.readFileSync(path, 'utf8');

if (!content.includes('import html2canvas')) {
  content = content.replace(
    'import ReactMarkdown',
    'import html2canvas from "html2canvas";\nimport ReactMarkdown'
  );
}

if (!content.includes('async function exportReport()')) {
  const exportFunc = `

  async function exportReport() {
    const el = document.getElementById("ai-report-card");
    if (!el) return;
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = \`\${selectedFeed?.child.name ?? "child"}-AI健康报告.png\`;
      link.href = dataUrl;
      link.click();
      toast.success("导出成功", { description: "周报长图已下载到本地" });
    } catch (e) {
      toast.error("导出失败", { description: "生成图片时发生错误, 请稍后重试" });
    }
  }

  function submitFeedback() {`;
  content = content.replace('  function submitFeedback() {', exportFunc);
}

content = content.replace(
  /<div className="mb-4 flex items-center justify-end">\s*<Button variant="outline" size="sm" onClick=\{refreshAiSuggestion\} disabled=\{aiLoading \|\| !aiSnapshot\}>\s*\{aiLoading \? "[^"]*" : "[^"]*"\}\s*<\/Button>\s*<\/div>/,
  `<div className="mb-4 flex items-center justify-end gap-3">
                  <Button variant="outline" size="sm" className="hidden lg:flex" onClick={exportReport} disabled={aiLoading || !aiSuggestion}>
                    导出长图(推荐)
                  </Button>
                  <Button variant="outline" size="sm" onClick={refreshAiSuggestion} disabled={aiLoading || !aiSnapshot}>
                    {aiLoading ? "刷新中..." : "刷新 AI 建议"}
                  </Button>
                </div>`
);

content = content.replace(
  /<Card className="border-indigo-100 shadow-sm relative overflow-hidden">/g,
  '<Card id="ai-report-card" className="border-indigo-100 shadow-sm relative overflow-hidden">'
);
content = content.replace(
  /<Card className="border-indigo-100 shadow-sm">/g,
  '<Card id="ai-report-card" className="border-indigo-100 shadow-sm">'
);

fs.writeFileSync(path, content, 'utf8');
console.log("Export JS Patch applied");
