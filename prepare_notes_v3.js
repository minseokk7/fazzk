const { execSync } = require('child_process');
const fs = require('fs');

try {
    // 1. Get current notes
    let currentNotes = execSync('gh release view v1.2.0 --json body --jq .body', { encoding: 'utf-8' }).trim();

    // Define the section to replace (The one I just added)
    const oldSectionHeader = '### 확장 프로그램 상태 아이콘 (Extension Status)';

    // Define new content for Extension
    const newContent = `### 확장 프로그램 상태 표시 (Extension Status)
확장 프로그램 아이콘 위 **뱃지(Badge)**의 색상과 문자로 상태를 확인할 수 있습니다.
* 🟩 **(초록색 배경)**: **연결됨** - Fazzk 앱과 정상적으로 통신 중입니다.
* ❗ **! (빨간색 배경)**: **미연결** - 앱이 실행되지 않았거나 포트를 찾을 수 없습니다.
* 🔄 **↻ (주황색 배경)**: **동기화 중** - 네이버 로그인 정보를 앱으로 전송하고 있습니다.`;

    let finalNotes = currentNotes;

    // Replace if exists
    if (finalNotes.includes(oldSectionHeader)) {
        const idx = finalNotes.indexOf(oldSectionHeader);
        if (idx !== -1) {
            finalNotes = finalNotes.substring(0, idx) + newContent;
        }
    } else {
        // Just append if not found (or if previous replace failed to find exact match)
        finalNotes += '\n\n' + newContent;
    }

    // 4. Save to file
    fs.writeFileSync('final_release_notes_v3.md', finalNotes.trim(), { encoding: 'utf-8' });
    console.log('Notes prepared in final_release_notes_v3.md');

} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}
