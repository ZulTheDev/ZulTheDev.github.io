$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDir ".env"

if (-not (Test-Path $envFile)) {
    New-Item -ItemType File -Path $envFile -Force | Out-Null
}

$text = Get-Content $envFile -Raw

if ($text -match "(?m)^CONTENT_FILE=.*$") {
    $text = $text -replace "(?m)^CONTENT_FILE=.*$", "CONTENT_FILE=../client/public/content.json"
}
else {
    if ($text.Length -gt 0 -and -not $text.EndsWith("`r`n")) {
        $text += "`r`n"
    }

    $text += "CONTENT_FILE=../client/public/content.json`r`n"
}

Set-Content $envFile $text -Encoding utf8

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CONTENT_FILE" -ForegroundColor Cyan
Write-Host "========================================"
Get-Content $envFile | Select-String "^CONTENT_FILE="
Write-Host ""

$contentPath = Join-Path $scriptDir "..\client\public\content.json"
$contentPath = [System.IO.Path]::GetFullPath($contentPath)

Write-Host "Expected content file:"
Write-Host $contentPath
Write-Host ""

if (Test-Path $contentPath) {
    Write-Host "CONTENT FILE FOUND" -ForegroundColor Green
}
else {
    Write-Host "CONTENT FILE NOT FOUND" -ForegroundColor Red
    exit 1
}