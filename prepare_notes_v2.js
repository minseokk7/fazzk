const { execSync } = require('child_process');
const fs = require('fs');

try {
    // 1. Get current notes
    // We start fresh or from the version before my last edit if possible? 
    // actually, simpler to just get current and replace the section I added.
    let currentNotes = execSync('gh release view v1.2.0 --json body --jq .body', { encoding: 'utf-8' }).trim();

    // Define the section to replace (The one I just added)
    const oldSectionHeader = '### 연결 상태 표시 (Connection Status)';

    // Define new content for Extension
    const newContent = `### 확장 프로그램 상태 아이콘 (Extension Status)
브라우저 우측 상단 확장 프로그램 아이콘의 뱃지(Badge)로 상태를 확인할 수 있습니다.
* 🟩 **(초록색)**: **연결됨** - Fazzk 앱과 정상적으로 통신 중입니다.
* ❗ **! (빨간색)**: **미연결** - 앱이 실행되지 않았거나 포트를 찾을 수 없습니다.
* 🔄 **↻ (주황색)**: **동기화 중** - 네이버 로그인 정보를 앱으로 전송하고 있습니다.`;

    let finalNotes = currentNotes;

    // Replace if exists, otherwise append
    if (finalNotes.includes(oldSectionHeader)) {
        // Simple string replacement might be risky if I don't catch the end of the section.
        // But since I appended it at the end, I can try to replace from header to end or just replace the specific strings.
        // Let's try to find the index and replace.
        const idx = finalNotes.indexOf(oldSectionHeader);
        if (idx !== -1) {
            // Assuming it was the last thing added.
            finalNotes = finalNotes.substring(0, idx) + newContent;
        }
    } else {
        // If not found (maybe I am running first time?), just append
        finalNotes += '\n\n' + newContent;
    }

    // 4. Save to file
    fs.writeFileSync('final_release_notes_v2.md', finalNotes.trim(), { encoding: 'utf-8' });
    console.log('Notes prepared in final_release_notes_v2.md');

} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}
