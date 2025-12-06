const { execSync } = require('child_process');
const fs = require('fs');

try {
    // 1. Get current notes
    const currentNotes = execSync('gh release view v1.2.0 --json body --jq .body', { encoding: 'utf-8' }).trim();

    // 2. Define new content
    const newContent = `
### 연결 상태 표시 (Connection Status)
OBS 화면 상단에 현재 상태를 직관적으로 표시합니다.
* ✅ **연결됨 - 팔로워 알림 대기 중**: 정상적으로 서버와 연결되어 있습니다.
* ⚠️ **세션이 만료되었습니다**: 네이버 로그인이 필요합니다.
* 🔄 **재연결 중...**: 일시적인 연결 끊김으로 자동 복구를 시도하고 있습니다.
`;

    // 3. Combine (avoid duplication if already exists)
    let finalNotes = currentNotes;
    if (!finalNotes.includes('연결 상태 표시')) {
        finalNotes += '\n' + newContent;
    } else {
        console.log('Already contains connection status info.');
    }

    // 4. Save to file
    fs.writeFileSync('final_release_notes.md', finalNotes, { encoding: 'utf-8' });
    console.log('Notes prepared in final_release_notes.md');

} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}
