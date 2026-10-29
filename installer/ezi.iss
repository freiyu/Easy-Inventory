; EZI Inventory installer (PRD 11). Built by build.ps1 from the folder installer/stage.sh prepared.
; Program files go to {app} and are replaced by updates; data lives in {commonappdata}\EZI and is never replaced (PRD 11.3).
; The real work (database, services, firewall, smoke test) is done by app\cli.mjs, so its log explains every failure.
#include "version.iss"

[Setup]
AppId={{6F1D2A7C-4E3B-4C55-9A1E-3E2100000001}
AppName=EZI Inventory
AppVersion={#AppVersion}
AppVerName=EZI Inventory {#AppVersion}
AppPublisher=EZI
DefaultDirName={autopf}\EZI
DefaultGroupName=EZI Inventory
UsePreviousAppDir=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=output
OutputBaseFilename=EZI-Setup-{#AppVersion}
SetupIconFile=ezi.ico
UninstallDisplayIcon={app}\ezi.ico
UninstallDisplayName=EZI Inventory
LicenseFile=THIRD-PARTY-NOTICES.txt
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
CloseApplications=no
DisableProgramGroupPage=yes

[Languages]
Name: "id"; MessagesFile: "Indonesian.isl"

[Files]
Source: "stage\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "ezi.ico"; DestDir: "{app}"; Flags: ignoreversion

[INI]
Filename: "{app}\EZI.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{code:PortText}"
Filename: "{app}\EZI.url"; Section: "InternetShortcut"; Key: "IconFile"; String: "{app}\ezi.ico"
Filename: "{app}\EZI.url"; Section: "InternetShortcut"; Key: "IconIndex"; String: "0"

[Icons]
Name: "{group}\Buka EZI"; Filename: "{app}\EZI.url"; IconFilename: "{app}\ezi.ico"
Name: "{group}\Start EZI"; Filename: "{app}\tools\control.cmd"; Parameters: "start"; IconFilename: "{app}\ezi.ico"
Name: "{group}\Stop EZI"; Filename: "{app}\tools\control.cmd"; Parameters: "stop"; IconFilename: "{app}\ezi.ico"
Name: "{group}\Backup sekarang"; Filename: "{app}\tools\control.cmd"; Parameters: "backup"; IconFilename: "{app}\ezi.ico"
Name: "{group}\Restore dari backup"; Filename: "{app}\tools\control.cmd"; Parameters: "restore"; IconFilename: "{app}\ezi.ico"
Name: "{group}\Lihat log"; Filename: "{commonappdata}\EZI\logs"
Name: "{group}\Tampilkan alamat akses"; Filename: "{app}\tools\control.cmd"; Parameters: "address"; IconFilename: "{app}\ezi.ico"
Name: "{group}\Uninstall EZI"; Filename: "{uninstallexe}"
Name: "{autodesktop}\EZI Inventory"; Filename: "{app}\EZI.url"; IconFilename: "{app}\ezi.ico"

[Run]
Filename: "{app}\EZI.url"; Description: "Buka EZI sekarang"; Flags: postinstall shellexec nowait skipifsilent; Check: SetupSucceeded

[UninstallDelete]
Type: files; Name: "{app}\EZI.url"
Type: files; Name: "{app}\service\ezi-service.xml"
Type: files; Name: "{app}\service\*.log"

[Code]
var
  OptionsPage: TWizardPage;
  PortEdit: TNewEdit;
  LanBox, AutoBox: TNewCheckBox;
  IsUpdate, PreUpgraded, Succeeded, CleanPC: Boolean;
  OldPort, OldLan, OldAuto: String;

function DataDir: String;
begin
  Result := ExpandConstant('{commonappdata}\EZI');
end;

function PortText(Param: String): String;
begin
  Result := Trim(PortEdit.Text);
end;

function SetupSucceeded: Boolean;
begin
  Result := Succeeded;
end;

{ Reads one KEY=value line from the existing config, so an update shows the current options. }
function ConfigValue(Lines: TArrayOfString; Key, Default: String): String;
var
  I: Integer;
begin
  Result := Default;
  for I := 0 to GetArrayLength(Lines) - 1 do
    if Pos(Key + '=', Lines[I]) = 1 then
      Result := Copy(Lines[I], Length(Key) + 2, MaxInt);
end;

function RunTool(Params: String; var Code: Integer): Boolean;
begin
  Result := Exec(ExpandConstant('{app}\node\node.exe'), '"' + ExpandConstant('{app}\app\cli.mjs') + '" ' + Params,
    ExpandConstant('{app}\app'), SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
end;

function AddLabel(Top: Integer; Caption: String): TNewStaticText;
begin
  Result := TNewStaticText.Create(OptionsPage);
  Result.Parent := OptionsPage.Surface;
  Result.Top := Top;
  Result.Width := OptionsPage.SurfaceWidth;
  Result.WordWrap := True;
  Result.Caption := Caption;
end;

procedure InitializeWizard;
var
  Lines: TArrayOfString;
begin
  OldPort := '3000'; OldLan := '1'; OldAuto := '1';
  IsUpdate := FileExists(DataDir + '\config\ezi.env');
  if IsUpdate and LoadStringsFromFile(DataDir + '\config\ezi.env', Lines) then
  begin
    OldPort := ConfigValue(Lines, 'PORT', OldPort);
    OldLan := ConfigValue(Lines, 'EZI_LAN', OldLan);
    OldAuto := ConfigValue(Lines, 'EZI_AUTOSTART', OldAuto);
  end;

  OptionsPage := CreateCustomPage(wpSelectDir, 'Pengaturan EZI',
    'Pilih port dan cara EZI berjalan. Bisa diubah lagi dengan menjalankan installer ini kembali.');
  AddLabel(0, 'Port aplikasi (default 3000):');
  PortEdit := TNewEdit.Create(OptionsPage);
  PortEdit.Parent := OptionsPage.Surface;
  PortEdit.Top := ScaleY(18);
  PortEdit.Width := ScaleX(80);
  PortEdit.Text := OldPort;

  LanBox := TNewCheckBox.Create(OptionsPage);
  LanBox.Parent := OptionsPage.Surface;
  LanBox.Top := ScaleY(56);
  LanBox.Width := OptionsPage.SurfaceWidth;
  LanBox.Caption := 'Izinkan perangkat lain di jaringan kantor membuka EZI';
  LanBox.Checked := OldLan = '1';
  AddLabel(ScaleY(76), 'Menambah aturan Windows Firewall khusus jaringan Private. Database tetap tidak bisa diakses dari jaringan.');

  AutoBox := TNewCheckBox.Create(OptionsPage);
  AutoBox.Parent := OptionsPage.Surface;
  AutoBox.Top := ScaleY(120);
  AutoBox.Width := OptionsPage.SurfaceWidth;
  AutoBox.Caption := 'Jalankan EZI otomatis di latar belakang saat Windows menyala';
  AutoBox.Checked := OldAuto <> '0';
  AddLabel(ScaleY(140), 'Dicentang: EZI selalu siap dipakai tanpa perlu dibuka, juga setelah PC restart.' + #13#10 +
    'Tidak dicentang: setiap kali PC menyala, EZI harus dinyalakan dulu lewat Start Menu > EZI Inventory > Start EZI.');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Port: Integer;
begin
  Result := True;
  if CurPageID = OptionsPage.ID then
  begin
    Port := StrToIntDef(Trim(PortEdit.Text), 0);
    if (Port < 1024) or (Port > 65535) or (Port = 3307) then
    begin
      MsgBox('Port harus angka 1024 sampai 65535, dan bukan 3307 (dipakai database EZI).', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

{ Update (PRD 12.2): stop EZI and take a "Before update" backup with the OLD version before any file is replaced. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Result := '';
  if IsUpdate and FileExists(ExpandConstant('{app}\app\cli.mjs')) then
  begin
    PreUpgraded := RunTool('pre-upgrade', Code);
    if not PreUpgraded then
      Result := 'Backup sebelum update GAGAL (kode ' + IntToStr(Code) + '). Tidak ada file yang diganti.' + #13#10 +
        'Lihat log di ' + DataDir + '\logs';
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Code: Integer;
  Params: String;
begin
  if CurStep <> ssPostInstall then Exit;
  WizardForm.StatusLabel.Caption := 'Menyiapkan database, service, dan firewall EZI. Ini bisa 1-2 menit...';
  Params := 'install --port ' + Trim(PortEdit.Text);
  if LanBox.Checked then Params := Params + ' --lan 1' else Params := Params + ' --lan 0';
  if AutoBox.Checked then Params := Params + ' --autostart 1' else Params := Params + ' --autostart 0';
  { An update whose old program files were already removed had no pre-upgrade backup: take it now. }
  if IsUpdate and not PreUpgraded then Params := Params + ' --backup 1';
  Succeeded := RunTool(Params, Code);
  if not Succeeded then
    MsgBox('Instalasi EZI GAGAL (kode ' + IntToStr(Code) + ').' + #13#10#13#10 +
      'Data lama tidak disentuh. Lihat log terbaru di:' + #13#10 + DataDir + '\logs' + #13#10#13#10 +
      'Perbaiki masalahnya (lihat docs TROUBLESHOOTING), lalu jalankan installer ini lagi.', mbCriticalError, MB_OK);
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and Succeeded then
    WizardForm.FinishedLabel.Caption := 'EZI sudah berjalan dan lolos smoke test.' + #13#10#13#10 +
      'Di PC ini: http://localhost:' + Trim(PortEdit.Text) + #13#10 +
      'Alamat untuk perangkat lain: Start Menu > EZI Inventory > Tampilkan alamat akses.'
  else if CurPageID = wpFinished then
    WizardForm.FinishedLabel.Caption := 'Instalasi BELUM berhasil. Lihat log di ' + DataDir + '\logs';
end;

{ Uninstall (P136): "Pindah ke PC lain" keeps the data and copies a last backup to a folder;
  "Bersihkan PC" deletes all EZI data after a second confirmation. Nothing is removed if a step fails. }
function InitializeUninstall: Boolean;
var
  Choice, Code: Integer;
  Folder: String;
  WantBackup: Boolean;
begin
  Result := False;
  Choice := TaskDialogMsgBox('Uninstall EZI Inventory',
    'Pindah ke PC lain: membuat backup terakhir ke folder pilihan Anda. Data EZI di PC ini tetap disimpan.' + #13#10#13#10 +
    'Bersihkan PC: menghapus SEMUA data EZI di PC ini (database, backup, log, config).',
    mbConfirmation, MB_YESNOCANCEL, ['Pindah ke PC lain', 'Bersihkan PC'], 0);
  if Choice = IDCANCEL then Exit;
  CleanPC := Choice = IDNO;

  WantBackup := not CleanPC;
  if CleanPC then
    WantBackup := MsgBox('Buat backup terakhir dulu sebelum semua data dihapus? (disarankan)', mbConfirmation, MB_YESNO) = IDYES;
  if WantBackup and FileExists(ExpandConstant('{app}\app\cli.mjs')) then
  begin
    Folder := ExpandConstant('{userdocs}\EZI-backup');
    if not BrowseForFolder('Pilih folder untuk backup terakhir EZI (salin folder ini ke flashdisk untuk PC baru):', Folder, True) then Exit;
    if not RunTool('final-backup "' + Folder + '"', Code) then
    begin
      MsgBox('Backup terakhir GAGAL. Uninstall dibatalkan, tidak ada yang dihapus.' + #13#10 + 'Lihat log di ' + DataDir + '\logs', mbCriticalError, MB_OK);
      Exit;
    end;
  end;

  if CleanPC and (MsgBox('Semua data EZI di ' + DataDir + ' akan DIHAPUS PERMANEN dan tidak bisa dikembalikan.' + #13#10 + 'Lanjutkan?',
    mbCriticalError, MB_YESNO or MB_DEFBUTTON2) <> IDYES) then Exit;

  if FileExists(ExpandConstant('{app}\app\cli.mjs')) and not RunTool('remove', Code) then
  begin
    MsgBox('Service EZI tidak bisa dihentikan (kode ' + IntToStr(Code) + '). Uninstall dibatalkan.' + #13#10 + 'Lihat log di ' + DataDir + '\logs', mbCriticalError, MB_OK);
    Exit;
  end;
  if not CleanPC then
    MsgBox('Langkah di PC baru:' + #13#10 + '1. Install EZI dengan installer yang sama.' + #13#10 +
      '2. Start Menu > EZI Inventory > Restore dari backup, lalu pilih file backup tadi.' + #13#10#13#10 +
      'Data EZI di PC ini tetap ada di ' + DataDir + '.', mbInformation, MB_OK);
  Result := True;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and CleanPC then
    DelTree(DataDir, True, True, True);
end;
