const fs = require('fs');
const path = require('path');

console.log('🧹 dist 폴더 정리 시작...');

const distPath = path.join(__dirname, '..', 'dist');

// 제거할 폴더들
const foldersToRemove = [
  'css',
  'js', 
  'fonts',
  'v2.6.0'
];

// 제거할 파일들
const filesToRemove = [
  'vite.svg'
];

// 폴더 제거
foldersToRemove.forEach(folder => {
  const folderPath = path.join(distPath, folder);
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log(`✅ 폴더 제거: ${folder}`);
  }
});

// 파일 제거
filesToRemove.forEach(file => {
  const filePath = path.join(distPath, file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`✅ 파일 제거: ${file}`);
  }
});

// 남은 파일들 확인
console.log('\n📁 남은 파일들:');
function listFiles(dir, prefix = '') {
  const items = fs.readdirSync(dir);
  items.forEach(item => {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      console.log(`${prefix}📁 ${item}/`);
      listFiles(itemPath, prefix + '  ');
    } else {
      const size = (stat.size / 1024).toFixed(1);
      console.log(`${prefix}📄 ${item} (${size}KB)`);
    }
  });
}

listFiles(distPath);
console.log('\n✨ dist 폴더 정리 완료!');