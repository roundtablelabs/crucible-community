# Quick check script to verify .env file exists and has required variables
# Run from project root: .\scripts\check-env.ps1

# Get the project root directory (parent of scripts/)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

$ENV_FILE = ".env"

if (-not (Test-Path $ENV_FILE)) {
    Write-Host "❌ ERROR: .env file not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please generate secrets first:" -ForegroundColor Yellow
    Write-Host "  PowerShell: .\docker-compose.ps1 up -d"
    Write-Host "  Command Prompt: .\docker-compose.bat up -d"
    Write-Host ""
    Write-Host "Or manually:" -ForegroundColor Yellow
    Write-Host "  python scripts/generate_secrets.py"
    exit 1
}

# Check for required variables
$REQUIRED_VARS = @(
    "API_KEY_ENCRYPTION_KEY",
    "ROUNDTABLE_JWT_SECRET",
    "ROUNDTABLE_JWT_REFRESH_SECRET",
    "ROUNDTABLE_COMMUNITY_AUTH_PASSWORD",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "REDIS_PASSWORD"
)

$MISSING_VARS = @()
$envContent = Get-Content $ENV_FILE

foreach ($var in $REQUIRED_VARS) {
    $found = $false
    foreach ($line in $envContent) {
        if ($line -match "^${var}=(.*)$") {
            $value = $matches[1].Trim()
            if ($value -ne "" -and $value -ne '""') {
                $found = $true
                break
            }
        }
    }
    if (-not $found) {
        $MISSING_VARS += $var
    }
}

if ($MISSING_VARS.Count -gt 0) {
    Write-Host "❌ ERROR: Missing or empty required variables in .env:" -ForegroundColor Red
    foreach ($var in $MISSING_VARS) {
        Write-Host "  - $var" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "Please regenerate secrets:" -ForegroundColor Yellow
    Write-Host "  PowerShell: .\docker-compose.ps1 up -d"
    Write-Host "  Command Prompt: .\docker-compose.bat up -d"
    exit 1
}

Write-Host "✅ .env file exists and has all required variables" -ForegroundColor Green
exit 0
