#ifndef SourceDir
  #define SourceDir "."
#endif

#ifndef OutputDir
  #define OutputDir "."
#endif

#define AppName "MusicScale Live"
#ifndef AppVersion
  #define AppVersion "0.1.0-beta.1"
#endif
#define Publisher "MillionsNest"
#define NodeExe "MusicScaleLiveNode.exe"

[Setup]
AppId={{7C2385B6-752E-4E7D-9E5B-CC9DF3A5E936}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#Publisher}
DefaultDirName={autopf}\MusicScale Live
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=MusicScaleLiveSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}
CloseApplications=yes
RestartApplications=no
SetupLogging=yes

[Files]
Source: "{#SourceDir}\{#NodeExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\web\*"; DestDir: "{app}\web"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\README-INSTALL.md"; DestDir: "{app}"; Flags: ignoreversion

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "MusicScaleLiveNode"; ValueData: """{app}\{#NodeExe}"""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "MillionsNestLiveNode"; Flags: deletevalue

[Run]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM MillionsNestLiveNode.exe /F"; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/IM MusicScaleLiveNode.exe /F"; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""MillionsNest Live Node"""; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""MillionsNest Live Node Discovery"""; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""MusicScale Live Node"""; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""MusicScale Live Node Discovery"""; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""MusicScale Live Node"" dir=in action=allow protocol=TCP localport=4317 profile=private"; Flags: runhidden waituntilterminated
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""MusicScale Live Node Discovery"" dir=in action=allow protocol=UDP localport=4318 profile=private"; Flags: runhidden waituntilterminated
Filename: "{app}\{#NodeExe}"; Description: "Iniciar o MusicScale Live"; Flags: nowait postinstall skipifsilent
Filename: "http://127.0.0.1:4317/node"; Description: "Abrir configuração do MusicScale Live"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM {#NodeExe} /F"; Flags: runhidden waituntilterminated; RunOnceId: "StopNode"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""MillionsNest Live Node"""; Flags: runhidden waituntilterminated; RunOnceId: "DeleteLegacyFirewallTcp"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""MillionsNest Live Node Discovery"""; Flags: runhidden waituntilterminated; RunOnceId: "DeleteLegacyFirewallUdp"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""MusicScale Live Node"""; Flags: runhidden waituntilterminated; RunOnceId: "DeleteFirewallTcp"
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""MusicScale Live Node Discovery"""; Flags: runhidden waituntilterminated; RunOnceId: "DeleteFirewallUdp"

[Code]
procedure InitializeWizard;
begin
  WizardForm.Caption := 'MusicScale Live';
  WizardForm.WelcomeLabel1.Caption := 'Instalar MusicScale Live';
  WizardForm.WelcomeLabel2.Caption :=
    'Este assistente prepara o computador de produção para o MusicScale Live.' + #13#10 + #13#10 +
    'Você não precisa instalar Git, abrir PowerShell ou descobrir endereços IP.';
end;
