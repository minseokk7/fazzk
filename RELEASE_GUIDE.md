# Fazzk 릴리즈 가이드

## 📋 릴리즈 준비 체크리스트

### 1. 버전 업데이트
다음 파일들의 버전을 새 버전으로 업데이트:

```bash
# package.json
"version": "2.5.1"

# src-tauri/Cargo.toml
version = "2.5.1"

# src-tauri/tauri.conf.json
"version": "2.5.1"

# pages-svelte/src/lib/api.js (브라우저 모드 기본값)
if (!isTauri) return '2.5.1';

# pages-svelte/src/routes/Login.svelte (기본값)
let currentAppVersion = $state("2.5.1");
```

### 2. 빌드 설정 확인
`src-tauri/tauri.conf.json`에서 자동 빌드 설정 확인:

```json
{
  "build": {
    "beforeBuildCommand": "powershell -Command \"Set-Location ../pages-svelte; npm run build; Set-Location ..; npm run zip-extensions\"",
    "frontendDist": "../pages-svelte/dist"
  }
}
```

이 설정으로 `tauri build` 실행 시:
- 프론트엔드 빌드 (`pages-svelte` 디렉토리)
- 확장프로그램 빌드 (루트 디렉토리)
- 백엔드 빌드 및 설치 파일 생성

## 🔨 빌드 과정

### 단일 명령어로 전체 빌드
```bash
cd src-tauri
tauri build
```

이 명령어 하나로 모든 빌드 과정이 완료됩니다:
1. 프론트엔드 빌드 (Svelte)
2. 브라우저 확장프로그램 빌드 (Chrome/Firefox)
3. Rust 백엔드 컴파일
4. Windows 설치 파일 생성

### 1. 애플리케이션 빌드
```bash
cd src-tauri
tauri build
```

이 명령어는 자동으로:
- 프론트엔드 빌드 (`pages-svelte` 디렉토리에서 `npm run build`)
- 브라우저 확장프로그램 빌드 (`npm run zip-extensions`)
- Rust 백엔드 컴파일
- Windows 설치 파일 생성 (`Fazzk_X.X.X_x64-setup.exe`)

생성되는 파일들:
- `src-tauri/target/release/bundle/nsis/Fazzk_X.X.X_x64-setup.exe` - 메인 설치 파일
- `dist/vX.X.X/chrome-extension.zip` - 크롬 확장프로그램
- `dist/vX.X.X/firefox-extension.zip` - 파이어폭스 확장프로그램

### 2. ~~브라우저 확장프로그램 빌드~~ (자동 빌드됨)
~~이제 tauri build와 함께 자동으로 빌드되므로 별도 실행 불필요~~

## 📤 Git 및 GitHub 릴리즈

### 1. 변경사항 커밋
```bash
git add .
git commit -m "Release vX.X.X: [릴리즈 설명]"
```

### 2. 태그 생성
```bash
git tag -a vX.X.X -m "Release vX.X.X: [릴리즈 설명]"
```

### 3. GitHub에 푸시
```bash
git push origin master
git push origin vX.X.X
```

### 4. GitHub 릴리즈 생성 (모든 파일 한번에)
```bash
gh release create vX.X.X \
  "src-tauri/target/release/bundle/nsis/Fazzk_X.X.X_x64-setup.exe" \
  "dist/vX.X.X/chrome-extension.zip" \
  "dist/vX.X.X/firefox-extension.zip" \
  --title "릴리즈 vX.X.X: [제목]" \
  --notes "[릴리즈 노트 내용]"
```

### 5. ~~확장프로그램 파일 추가~~ (위에서 함께 업로드됨)
~~이제 릴리즈 생성 시 모든 파일을 한번에 업로드하므로 별도 단계 불필요~~

## 📝 릴리즈 노트 템플릿

```markdown
## 🎉 릴리즈 vX.X.X: [제목]

### ✨ 새로운 기능
- [새 기능 1]
- [새 기능 2]

### 🚀 성능 개선
- [성능 개선 1]
- [성능 개선 2]

### 🎨 UI/UX 개선
- [UI 개선 1]
- [UI 개선 2]

### 🔧 기술적 개선
- [기술적 개선 1]
- [기술적 개선 2]

### 🐛 버그 수정
- [버그 수정 1]
- [버그 수정 2]

### 📦 설치 방법
`Fazzk_X.X.X_x64-setup.exe` 파일을 다운로드하여 실행하면 최신 버전이 설치됩니다.

### 📋 포함된 파일
- **Fazzk_X.X.X_x64-setup.exe** - 메인 애플리케이션 설치 파일
- **chrome-extension.zip** - 크롬 브라우저 확장프로그램
- **firefox-extension.zip** - 파이어폭스 브라우저 확장프로그램

---

**전체 변경사항**: https://github.com/minseokk7/fazzk/compare/vX.X.X-1...vX.X.X
```

## 🔍 릴리즈 후 확인사항

### 1. 자동 업데이트 테스트
- 이전 버전에서 새 버전으로 업데이트 확인
- 업데이트 모달이 올바르게 표시되는지 확인
- 자동 업데이트 기능이 정상 작동하는지 확인

### 2. 기능 테스트
- 루블리스 테스트 팔로워 기능
- WebSocket 실시간 알림
- OBS 브라우저 소스 호환성
- 설정 저장/불러오기
- 키보드 단축키

### 3. 브라우저 확장프로그램 테스트
- 크롬/파이어폭스에서 확장프로그램 설치
- 쿠키 추출 및 전송 기능
- 메인 앱과의 연동

## 🚨 주의사항

### 버전 일관성
- 모든 파일의 버전이 일치하는지 확인
- 하드코딩된 버전이 없는지 확인

### 빌드 환경
- Windows 환경에서 빌드 필요 (NSIS 설치 파일 생성)
- Node.js, Rust, Tauri CLI 최신 버전 사용

### GitHub 설정
- GitHub CLI (`gh`) 설치 및 인증 필요
- 저장소 권한 확인

### 자동 업데이트
- GitHub 릴리즈가 생성되어야 자동 업데이트 감지 가능
- 릴리즈 노트는 사용자에게 표시되므로 한국어로 작성

## 📞 문제 해결

### 빌드 실패 시
1. `pages-svelte/dist` 폴더 존재 확인
2. `npm install` 재실행
3. Rust 컴파일러 업데이트

### 릴리즈 업로드 실패 시
1. GitHub 토큰 권한 확인
2. 파일 경로 확인
3. 네트워크 연결 상태 확인

### 자동 업데이트 실패 시
1. GitHub 릴리즈 URL 확인
2. 버전 비교 로직 확인
3. 설치 파일 권한 확인