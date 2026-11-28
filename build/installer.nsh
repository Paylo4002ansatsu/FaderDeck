!macro customInstall
  DetailPrint "Configurando o Firewall para redes privadas..."
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="FaderDeck - Rede local" program="$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="FaderDeck - Rede local" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=private remoteip=localsubnet protocol=TCP'
  Pop $0
  ${if} $0 != "0"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Não foi possível configurar o Firewall do Windows. A conexão do celular pode não funcionar."
  ${endif}
!macroend

!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="FaderDeck - Rede local" program="$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  ${if} $0 != "0"
    DetailPrint "Não foi possível remover a regra de Firewall do FaderDeck."
  ${endif}
!macroend
