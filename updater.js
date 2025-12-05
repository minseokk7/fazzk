/**
 * 자동 업데이트 모듈
 * GitHub Releases에서 새 버전을 확인하고 업데이트
 */
const { autoUpdater } = require('electron-updater');
const { ipcMain, dialog } = require('electron');

let mainWindow = null;

/**
 * 업데이터 초기화
 */
function initUpdater(win) {
    mainWindow = win;

    // 자동 다운로드 비활성화 (사용자 확인 후 다운로드)
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // 업데이트 확인 가능 시
    autoUpdater.on('update-available', (info) => {
        console.log('[Updater] 새 버전 발견:', info.version);

        if (mainWindow) {
            mainWindow.webContents.send('update-available', {
                version: info.version,
                releaseDate: info.releaseDate
            });
        }

        // 사용자에게 다운로드 여부 확인
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '업데이트 가능',
            message: `새 버전 ${info.version}이 있습니다. 다운로드하시겠습니까?`,
            buttons: ['예', '나중에'],
            defaultId: 0
        }).then(result => {
            if (result.response === 0) {
                autoUpdater.downloadUpdate();
            }
        });
    });

    // 업데이트 없음
    autoUpdater.on('update-not-available', () => {
        console.log('[Updater] 최신 버전입니다.');
    });

    // 다운로드 진행률
    autoUpdater.on('download-progress', (progress) => {
        console.log(`[Updater] 다운로드 중: ${Math.round(progress.percent)}%`);

        if (mainWindow) {
            mainWindow.webContents.send('update-progress', {
                percent: progress.percent,
                transferred: progress.transferred,
                total: progress.total
            });
        }
    });

    // 다운로드 완료
    autoUpdater.on('update-downloaded', () => {
        console.log('[Updater] 다운로드 완료');

        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '업데이트 준비 완료',
            message: '업데이트가 다운로드되었습니다. 앱을 재시작하면 설치됩니다.',
            buttons: ['지금 재시작', '나중에'],
            defaultId: 0
        }).then(result => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall(false, true);
            }
        });
    });

    // 오류 처리
    autoUpdater.on('error', (error) => {
        console.error('[Updater] 오류:', error.message);
    });
}

/**
 * 업데이트 확인
 */
function checkForUpdates() {
    console.log('[Updater] 업데이트 확인 중...');
    autoUpdater.checkForUpdates().catch(err => {
        console.error('[Updater] 확인 실패:', err.message);
    });
}

// IPC 핸들러
ipcMain.handle('check-for-updates', () => {
    checkForUpdates();
});

module.exports = {
    initUpdater,
    checkForUpdates
};
