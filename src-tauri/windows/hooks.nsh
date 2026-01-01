; Fazzk NSIS 인스톨러 템플릿
; 기본 Tauri NSIS 템플릿을 확장한 버전

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

; 기본 설정
Name "{{product_name}}"
OutFile "{{out_file}}"
Unicode True
RequestExecutionLevel Admin
InstallDir "$PROGRAMFILES64\{{product_name}}"

; 인터페이스 설정
!define MUI_ICON "{{installer_icon}}"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "{{header_image}}"
!define MUI_WELCOMEFINISHPAGE_BITMAP "{{sidebar_image}}"

; 페이지 설정
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "{{license}}"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\{{main_binary_name}}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Fazzk 실행"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; 언어 설정
!insertmacro MUI_LANGUAGE "Korean"

; 버전 정보
VIProductVersion "{{version_with_build}}"
VIAddVersionKey "ProductName" "{{product_name}}"
VIAddVersionKey "ProductVersion" "{{version}}"
VIAddVersionKey "FileDescription" "{{product_name}} 설치 프로그램"
VIAddVersionKey "FileVersion" "{{version}}"
VIAddVersionKey "CompanyName" "{{publisher}}"
VIAddVersionKey "LegalCopyright" "{{copyright}}"

; 설치 섹션
Section "Fazzk 애플리케이션" SecMain
  SectionIn RO
  
  ; 이전 버전 확인 및 정리
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{{product_name}}" "UninstallString"
  ${If} $0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "이전 버전의 Fazzk가 설치되어 있습니다. 제거하고 계속하시겠습니까?" IDYES uninstall_old IDNO skip_uninstall
    uninstall_old:
      ExecWait '$0 /S'
    skip_uninstall:
  ${EndIf}
  
  ; 파일 설치
  SetOutPath "$INSTDIR"
  {{#each bundle_resources}}
  File /r "{{this}}"
  {{/each}}
  
  ; 바탕화면 바로가기 생성
  CreateShortcut "$DESKTOP\{{product_name}}.lnk" "$INSTDIR\{{main_binary_name}}.exe"
  
  ; 시작 메뉴 바로가기 생성
  CreateDirectory "$SMPROGRAMS\{{product_name}}"
  CreateShortcut "$SMPROGRAMS\{{product_name}}\{{product_name}}.lnk" "$INSTDIR\{{main_binary_name}}.exe"
  CreateShortcut "$SMPROGRAMS\{{product_name}}\{{product_name}} 제거.lnk" "$INSTDIR\uninstall.exe"
  
  ; 레지스트리 등록
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{{product_name}}" "DisplayName" "{{product_name}}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{{product_name}}" "UninstallString" "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{{product_name}}" "DisplayVersion" "{{version}}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{{product_name}}" "Publisher" "{{publisher}}"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{{product_name}}" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{{product_name}}" "NoRepair" 1
  
  ; 제거 프로그램 생성
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

; 제거 섹션
Section "Uninstall"
  ; 실행 중인 프로세스 종료 확인
  FindProcDLL::FindProc "{{main_binary_name}}.exe"
  ${If} $R0 = 1
    MessageBox MB_YESNO|MB_ICONQUESTION "Fazzk가 실행 중입니다. 종료하고 제거를 계속하시겠습니까?" IDYES kill_process IDNO abort_uninstall
    kill_process:
      KillProcDLL::KillProc "{{main_binary_name}}.exe"
      Sleep 2000
      Goto continue_uninstall
    abort_uninstall:
      Abort
    continue_uninstall:
  ${EndIf}
  
  ; 파일 제거
  RMDir /r "$INSTDIR"
  
  ; 바로가기 제거
  Delete "$DESKTOP\{{product_name}}.lnk"
  RMDir /r "$SMPROGRAMS\{{product_name}}"
  
  ; 레지스트리 정리
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\{{product_name}}"
  
  ; 사용자 데이터 보존 여부 확인
  MessageBox MB_YESNO|MB_ICONQUESTION "사용자 설정과 히스토리를 삭제하시겠습니까?$\n(아니오를 선택하면 재설치 시 기존 설정을 유지할 수 있습니다)" IDYES delete_userdata IDNO keep_userdata
  delete_userdata:
    RMDir /r "$APPDATA\{{bundle_identifier}}"
    RMDir /r "$LOCALAPPDATA\{{bundle_identifier}}"
  keep_userdata:
SectionEnd