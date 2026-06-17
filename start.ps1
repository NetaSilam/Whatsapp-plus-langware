<#
.SYNOPSIS
  Restart the Chatter app and load it with 3 demo users.

.DESCRIPTION
  One command to get a clean demo going:
    1. Frees ports 3000 (frontend) and 8080 (backend) from any old run.
    2. Ensures Docker + the Supabase local stack are up.
    3. Resets the database and applies the schema (clean slate).
    4. Starts the FastAPI backend and the Next.js frontend (each in its own window).
    5. Waits until both are healthy, then seeds Alice, Bob, Carol + sample chats.
    6. Opens the app in your browser.

.PARAMETER KeepData
  Skip the database reset (keep existing data). Users are still seeded idempotently.

.PARAMETER NoBrowser
  Do not open the browser at the end.

.EXAMPLE
  ./start.ps1
  ./start.ps1 -KeepData
#>
param(
  [switch]$KeepData,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Py = Join-Path $Root "backend\.venv\Scripts\python.exe"

# Make scoop-installed tools (supabase) available in this session.
$env:Path = "$env:USERPROFILE\scoop\shims;$env:Path"

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!] $m" -ForegroundColor Yellow }

function Free-Port($port) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; Warn "killed old process on port $port" } catch {}
  }
}

function Wait-Url($url, $name, $timeoutSec = 90) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { Ok "$name is up"; return $true }
    } catch { Start-Sleep -Milliseconds 800 }
  }
  throw "$name did not become ready at $url within $timeoutSec s"
}

# --- 0. sanity ---
if (-not (Test-Path $Py)) {
  throw "Backend venv not found at $Py. Run 'python setup.py' first."
}

# --- 1. free ports ---
Info "Stopping any previous app processes"
Free-Port 3000
Free-Port 8080

# --- 2. Docker + Supabase ---
Info "Checking Docker"
try {
  docker info *> $null
  Ok "Docker is running"
} catch {
  Warn "Docker not running - launching Docker Desktop (this can take a minute)"
  $dd = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dd) { Start-Process $dd }
  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $deadline) {
    try { docker info *> $null; break } catch { Start-Sleep -Seconds 3 }
  }
  docker info *> $null
  Ok "Docker is running"
}

Info "Ensuring Supabase local stack is up"
$needStart = $true
try { supabase status *> $null; if ($LASTEXITCODE -eq 0) { $needStart = $false } } catch {}
if ($needStart) {
  Push-Location $Root
  supabase start
  Pop-Location
}
Ok "Supabase ready"

# --- 3. database ---
if ($KeepData) {
  Warn "Keeping existing data (-KeepData)"
} else {
  Info "Resetting database (clean schema)"
  Push-Location $Root
  supabase db reset
  Pop-Location
  Ok "Database reset"
}

# --- 4. start services ---
Info "Starting backend (FastAPI :8080)"
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$Root\backend'; .\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8080"
) | Out-Null

Info "Starting frontend (Next.js :3000)"
Start-Process powershell -ArgumentList @(
  "-NoExit", "-Command",
  "cd '$Root\frontend'; npm run dev"
) | Out-Null

# --- 5. wait for health, then seed ---
Wait-Url "http://localhost:8080/api/health" "Backend"
Wait-Url "http://localhost:3000/login" "Frontend"

Info "Seeding 3 demo users (Alice, Bob, Carol) + sample chats"
& $Py (Join-Path $Root "backend\seed_demo.py")

# --- 6. done ---
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host " Chatter is ready at http://localhost:3000" -ForegroundColor Green
Write-Host " Log in (the 6-digit code is shown on screen):" -ForegroundColor Green
Write-Host "   Alice  +15550000001" -ForegroundColor Green
Write-Host "   Bob    +15550000002" -ForegroundColor Green
Write-Host "   Carol  +15550000003" -ForegroundColor Green
Write-Host " Tip: open 3 separate browser windows (or profiles), one per user." -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green

if (-not $NoBrowser) { Start-Process "http://localhost:3000/login" }
