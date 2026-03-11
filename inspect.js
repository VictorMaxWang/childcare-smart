const fs = require('fs');
let content = fs.readFileSync('app/teacher/page.tsx', 'utf8');
const lines = content.split('\n');
for(let i=70; i<110; i++) { console.log(i + ': ' + lines[i]); }
