---
description: GitHub 릴리즈 생성 방법 (빌드 + 업로드 + latest.yml 포함)
---

# Fazzk 릴리즈 워크플로우

## 1. 버전 업데이트
`package.json`의 `version` 필드를 새 버전으로 수정합니다.

## 2. Git 커밋 및 푸시
```powershell
git add -A
git commit -m "v버전번호: 변경 내용 요약"
git push origin master
```

## 3. 빌드
// turbo
```powershell
npm run build
```

## 4. GitHub 릴리즈 생성
// turbo
```powershell
gh release create v버전번호 "dist/Fazzk Setup 버전번호.exe" "dist/fazzk-extension-v버전번호.zip" "dist/latest.yml" --title "v버전번호" --notes "릴리즈 노트 내용"
```

## 예시 (v1.3.0)
```powershell
gh release create v1.3.0 "dist/Fazzk Setup 1.3.0.exe" "dist/fazzk-extension-v1.3.0.zip" "dist/latest.yml" --title "v1.3.0" --notes "## v1.3.0 업데이트`n- 새 기능 1`n- 새 기능 2"
```

## 중요: latest.yml
- `latest.yml` 파일은 **반드시** 릴리즈에 포함되어야 자동 업데이트가 작동합니다.
- `electron-updater`가 이 파일을 읽어서 새 버전을 확인합니다.
