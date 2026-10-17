; Animated welcome-page sidebar for the Windows installer.
;
; MUI only accepts a static BMP for the welcome and finish image
; (MUI_WELCOMEFINISHPAGE_BITMAP), so the animation is painted over that
; control by the AnimGif plug-in. The static BMP named in tauri.conf.json is
; what MUI draws until the hook attaches, and it stays on the finish page.
;
; Both callbacks run inside MUI's own welcome page function, so every register
; this file touches is pushed and popped again.

!addplugindir /x86-unicode "${__FILEDIR__}\plugins\x86-unicode"

; Captured at include time. Tauri expands hook macros where it inserts them, so
; ${__FILEDIR__} inside a macro body would point at the generated script instead.
!define BETTERSHAPE_SIDEBAR_GIF "${__FILEDIR__}\sidebar.gif"

; MUI2 builds the welcome page as a #32770 dialog holding one SS_BITMAP static
; for the sidebar (Contrib/Modern UI 2/Pages/Welcome.nsh, unchanged in NSIS
; 3.11). NSIS destroys the previous page dialog before it creates the next one
; (Source/exehead/Ui.c), so that dialog is the only #32770 child of $HWNDPARENT
; while this callback runs, which is also the lookup AnimGif performs when no
; /HWND is given. The handle is found by walking the page children and testing
; STM_GETIMAGE rather than by naming $mui.WelcomePage.Image, because MUI
; declares that variable after Tauri includes this file.
Function BetterShapeSidebarShow
    Push $R0
    Push $R1
    Push $R2
    Push $R3

    File /oname=$PLUGINSDIR\bettershape-sidebar.gif "${BETTERSHAPE_SIDEBAR_GIF}"

    ; Fall back to the installer window itself if the page is not nested in a
    ; dialog of its own.
    FindWindow $R0 "#32770" "" $HWNDPARENT
    StrCmp $R0 0 0 BetterShapeSidebarHavePage
        StrCpy $R0 $HWNDPARENT
    BetterShapeSidebarHavePage:
    StrCmp $R0 0 BetterShapeSidebarDone

    StrCpy $R1 0
    BetterShapeSidebarFind:
        FindWindow $R2 "" "" $R0 $R1
        StrCmp $R2 0 BetterShapeSidebarDone
        ; wParam 0 is IMAGE_BITMAP. Only the sidebar static holds a bitmap;
        ; the title and body labels return 0 and are skipped.
        SendMessage $R2 ${STM_GETIMAGE} 0 0 $R3
        StrCmp $R3 0 BetterShapeSidebarNext
            ; Two reasons to detach MUI's bitmap before playback. The static's
            ; own window procedure paints it after AnimGif paints a frame, and
            ; MUI deletes it with ${NSD_FreeImage} once the page closes, which
            ; would leave the control holding a freed handle.
            ${NSD_ClearImage} $R2
            AnimGif::play /NOUNLOAD /HWND=$R2 /FIT=BOTH /HALIGN=0 /VALIGN=0 "$PLUGINSDIR\bettershape-sidebar.gif"
            Goto BetterShapeSidebarDone
    BetterShapeSidebarNext:
        StrCpy $R1 $R2
        Goto BetterShapeSidebarFind
    BetterShapeSidebarDone:
    Pop $R3
    Pop $R2
    Pop $R1
    Pop $R0
FunctionEnd

; AnimGif::stop is safe when play never ran: the plug-in checks its own state
; and the window handle before it restores anything. play also calls stop
; first, so returning to this page with Back cannot double-subscribe.
Function BetterShapeSidebarLeave
    AnimGif::stop
FunctionEnd

; Consumed by the welcome page, which the template declares immediately after
; this include. MUI undefines both symbols once that page is inserted, so they
; cannot leak into the uninstaller pages that define their own callbacks later
; in the same template.
!define MUI_PAGE_CUSTOMFUNCTION_SHOW BetterShapeSidebarShow
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE BetterShapeSidebarLeave
