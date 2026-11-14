# Uploads Ballpark from this PC to the server.
#
#   First time:   .\deploy\deploy.ps1 -Server 1.2.3.4 -Setup -Domain play.example.com -UploadData
#   Later:        .\deploy\deploy.ps1 -Server 1.2.3.4
#   Fetch data:   .\deploy\deploy.ps1 -Server 1.2.3.4 -DownloadData
#
# -Setup         installs Node, Caddy and the service on a fresh Ubuntu server (needs -Domain).
# -UploadData    replaces the server's database with this PC's data\ballpark.sqlite (and the profile pictures).
#                The server's current database is saved first as db-replaced-<time>.sqlite.
# -DownloadData  copies the server's database into backups\ on this PC. The game pauses for a second or two
#                while the file is copied; nothing on the server is changed.
#
# Not uploaded, on purpose: data\paddle.json and data\admins.txt. Put those on the server by hand.
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$User = 'root',
  [string]$Domain,
  [switch]$Setup,
  [switch]$UploadData,
  [switch]$DownloadData
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$target = "$User@$Server"

function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)" } }

if ($DownloadData) {
  $dir = Join-Path $root 'backups'
  New-Item -ItemType Directory -Force $dir | Out-Null
  $file = Join-Path $dir ("db-server-{0}.sqlite" -f (Get-Date -Format 'yyyy-MM-dd-HHmm'))
  # stopped for the copy, so the file is never caught in the middle of a write
  ssh $target 'systemctl stop ballpark && cp /var/lib/ballpark/ballpark.sqlite /root/db-download.sqlite; systemctl start ballpark'; Check 'Copy on the server'
  scp "${target}:/root/db-download.sqlite" $file; Check 'Download'
  ssh $target 'rm -f /root/db-download.sqlite'
  Write-Host "Saved the server database to $file"
  return
}

if ($Setup) {
  if (-not $Domain) { throw '-Setup needs -Domain, e.g. -Domain play.example.com' }
  scp "$PSScriptRoot\setup-server.sh" "${target}:/root/setup-server.sh"; Check 'Upload of setup script'
  ssh $target "sed -i 's/\r$//' /root/setup-server.sh && bash /root/setup-server.sh $Domain"; Check 'Server setup'
}

Write-Host 'Uploading the app...'
$code = Get-ChildItem -Path $root -Filter *.js -File | ForEach-Object { $_.FullName }      # server.js and its modules
scp @code "$root\package.json" "${target}:/opt/ballpark/"; Check 'Upload'
scp -r "$root\geo" "${target}:/opt/ballpark/"; Check 'Upload'
scp -r "$root\public" "${target}:/opt/ballpark/"; Check 'Upload'

if ($UploadData) {
  $db = Join-Path $root 'data\ballpark.sqlite'
  if (-not (Test-Path $db)) { throw "No data\ballpark.sqlite found. Start the game once on this PC (start.bat): that creates it from the old db.json." }
  Write-Host 'Uploading the database...'
  scp $db "${target}:/root/db-upload.sqlite"; Check 'Database upload'
  $cmd = 'systemctl stop ballpark; ' +
         'mkdir -p /var/lib/ballpark/backups && ' +
         '( [ ! -f /var/lib/ballpark/ballpark.sqlite ] || cp /var/lib/ballpark/ballpark.sqlite /var/lib/ballpark/backups/db-replaced-$(date +%Y%m%d-%H%M%S).sqlite ) && ' +
         'mv /root/db-upload.sqlite /var/lib/ballpark/ballpark.sqlite'
  ssh $target $cmd; Check 'Database install'
  $pics = Join-Path $root 'data\avatars'
  if (Test-Path $pics) { scp -r $pics "${target}:/var/lib/ballpark/"; Check 'Picture upload' }
  ssh $target 'chown -R ballpark:ballpark /var/lib/ballpark'; Check 'Database install'
}

ssh $target 'systemctl restart ballpark && sleep 1 && systemctl is-active ballpark && curl -s http://127.0.0.1:3000/api/health'; Check 'Restart'
Write-Host ''
Write-Host 'Deployed.'
