const fs = require('fs');
const path = require('path');

console.log('🧹 프로젝트 정리 시작...');

// 제거할 파일들
const filesToRemove = [
  'git_log.txt',                    // Git 로그 파일
  'src-tauri/src/server.rs.backup', // 백업 파일
  'src/routes/test-marker.txt',     // 테스트 마커 파일
  'src/assets/svelte.svg',          // 사용하지 않는 Svelte 로고
  'public/vite.svg',                // 사용하지 않는 Vite 로고
];

// 제거할 폴더들 (비어있거나 불필요한 경우)
const foldersToCheck = [
  'src/assets',                     // svelte.svg 제거 후 비어있을 수 있음
];

// 파일 제거
filesToRemove.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`✅ 파일 제거: ${file}`);
  } else {
    console.log(`⚠️  파일 없음: ${file}`);
  }
});

// 빈 폴더 제거
foldersToCheck.forEach(folder => {
  const folderPath = path.join(__dirname, '..', folder);
  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath);
    if (files.length === 0) {
      fs.rmdirSync(folderPath);
      console.log(`✅ 빈 폴더 제거: ${folder}`);
    } else {
      console.log(`📁 폴더 유지 (파일 있음): ${folder} - ${files.join(', ')}`);
    }
  }
});

// public 폴더의 불필요한 파일들 정리
const publicUnnecessaryFiles = [
  'public/css',     // Vite가 assets에 번들링하므로 불필요
  'public/js',      // Vite가 assets에 번들링하므로 불필요
  'public/fonts',   // Vite가 assets에 번들링하므로 불필요
];

publicUnnecessaryFiles.forEach(item => {
  const itemPath = path.join(__dirname, '..', item);
  if (fs.existsSync(itemPath)) {
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      fs.rmSync(itemPath, { recursive: true, force: true });
      console.log(`✅ 폴더 제거: ${item}`);
    } else {
      fs.unlinkSync(itemPath);
      console.log(`✅ 파일 제거: ${item}`);
    }
  }
});

// .gitignore 업데이트 (불필요한 항목들 정리)
const gitignorePath = path.join(__dirname, '..', '.gitignore');
if (fs.existsSync(gitignorePath)) {
  let gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  
  // 중복 제거 및 정리
  const lines = gitignoreContent.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .filter((line, index, arr) => arr.indexOf(line) === index) // 중복 제거
    .sort();
  
  const cleanGitignore = `# Dependencies
node_modules/

# Build outputs
dist/
src-tauri/target/

# Environment files
.env
.env.local
.env.*.local

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Temporary files
*.tmp
*.temp
.cache/

# Package manager files
package-lock.json
yarn.lock
pnpm-lock.yaml

${lines.filter(line => 
  !['node_modules/', 'dist/', 'src-tauri/target/', '.DS_Store', 'Thumbs.db', '*.log'].includes(line)
).join('\n')}
`;

  fs.writeFileSync(gitignorePath, cleanGitignore);
  console.log('✅ .gitignore 정리 완료');
}

console.log('\n📊 정리 완료! 프로젝트가 깔끔해졌습니다.');

// 남은 중요 파일들 확인
console.log('\n📁 주요 파일 구조:');
const importantPaths = [
  'src/',
  'src-tauri/',
  'chrome_extension/',
  'scripts/',
  'docs/',
  'public/',
  'package.json',
  'README.md'
];

importantPaths.forEach(p => {
  const fullPath = path.join(__dirname, '..', p);
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const files = fs.readdirSync(fullPath);
      console.log(`📁 ${p} (${files.length} 항목)`);
    } else {
      console.log(`📄 ${p}`);
    }
  }
});