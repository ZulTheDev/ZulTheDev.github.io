param(
  [string]$Remote = "origin",
  [string]$Branch = "main",
  [string]$Message = "Force reset"
)

$ErrorActionPreference = "Stop"

# Make sure this is a Git repository
if ((git rev-parse --is-inside-work-tree).Trim() -ne "true") {
    throw "This folder is not a Git repository."
}

Write-Host "Fetching $Remote..."
git fetch $Remote

# Make sure all current local changes are included
Write-Host "Checking current repository..."

# Create a temporary orphan branch from the CURRENT working tree
$tmp = "__fresh_${Branch}_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

Write-Host "Creating fresh history: $tmp"
git checkout --orphan $tmp

# Stage everything currently in the folder
# git add -A

# Make sure there is something to commit
if (git diff --cached --quiet) {
    throw "Nothing to commit. The working tree appears to be empty."
}

Write-Host "Creating fresh commit..."
git commit -m $Message

# Replace remote main with this fresh history
Write-Host "Force pushing fresh history to $Remote/$Branch..."
git push $Remote "+HEAD:${Branch}"

# Rename the local temporary branch to main
Write-Host "Renaming local branch to $Branch..."

# Delete local main if it exists
git branch -D $Branch 2>$null
if ($LASTEXITCODE -ne 0) {
    $global:LASTEXITCODE = 0
}

git branch -m $Branch

# Remove the temporary remote branch if one somehow exists
try {
    git push $Remote --delete $tmp 2>$null
}
catch {
    # Ignore if the temporary branch does not exist remotely
}

Write-Host ""
Write-Host "============================================"
Write-Host " MAIN BRANCH UPDATED"
Write-Host "============================================"
Write-Host "Remote : $Remote"
Write-Host "Branch : $Branch"
Write-Host "Commit : $Message"
Write-Host ""
Write-Host "Remote main now points to the fresh history."
Write-Host "Local branch is now: $Branch"
Write-Host "============================================"