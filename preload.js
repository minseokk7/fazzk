const { contextBridge, ipcRenderer } = require('electron');

// Expose secure APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Cookie management APIs
  getCookies: () => ipcRenderer.invoke('get-cookies'),
  getCookiesForDomain: (domain) => ipcRenderer.invoke('get-cookies-for-domain', domain),

  // Session management APIs
  clearSessionData: () => ipcRenderer.invoke('clear-session-data'),

  // Development utilities (remove in production)
  log: (...args) => console.log('[Renderer]', ...args),

  // Navigation control
  navigateToUrl: (url) => ipcRenderer.invoke('navigate-to-url', url),

  // Login flow
  startLogin: () => ipcRenderer.invoke('start-login'),

  // Settings & Config
  selectAudioFile: () => ipcRenderer.invoke('select-audio-file'),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),

  // Update listeners
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_, data) => callback(data)),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (_, data) => callback(data)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (_, data) => callback(data)),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates')
});

// Log successful preload script loading
console.log('[Preload] Preload script loaded successfully');