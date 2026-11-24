[CmdletBinding()]
param(
    [switch]$IncludeProduction
)

$ErrorActionPreference = "Stop"

$projectLink = Join-Path (Get-Location).Path ".vercel\project.json"
if (-not (Test-Path -LiteralPath $projectLink)) {
    throw "Farmess is not linked to Vercel here. Run: npx.cmd --yes vercel@latest login, then npx.cmd --yes vercel@latest link."
}

$gitIgnore = & git check-ignore --quiet ".env.local"
if ($LASTEXITCODE -ne 0) {
    throw ".env.local is not ignored by Git. Fix .gitignore before writing API keys."
}

$envFile = Join-Path (Get-Location).Path ".env.local"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Set-LocalEnvironmentValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )

    if ($Value.Contains([char]10) -or $Value.Contains([char]13)) {
        throw "The supplied value for $Name contains a line break."
    }

    $lines = @()
    if (Test-Path -LiteralPath $envFile) {
        $lines = [System.IO.File]::ReadAllLines($envFile)
    }

    $pattern = "^\s*" + [regex]::Escape($Name) + "\s*="
    $kept = @($lines | Where-Object { $_ -notmatch $pattern })
    $escaped = $Value.Replace("\", "\\").Replace('"', '\"')
    $kept += ($Name + '="' + $escaped + '"')
    [System.IO.File]::WriteAllLines($envFile, [string[]]$kept, $utf8NoBom)
}

function Set-VercelSecretFromPipe {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Environment,
        [Parameter(Mandatory = $true)][string]$Value
    )

    $command = "npx.cmd --yes vercel@latest env add $Name $Environment --type secret --force --yes"
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $env:ComSpec
    $startInfo.Arguments = '/d /s /c "' + $command + '"'
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo

    if (-not $process.Start()) {
        throw "Could not start the Vercel CLI for $Name ($Environment)."
    }

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.WriteLine($Value)
    $process.StandardInput.Close()
    $process.WaitForExit()

    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()
    $exitCode = $process.ExitCode
    $process.Dispose()

    if ($exitCode -ne 0) {
        $details = ($stdout + [Environment]::NewLine + $stderr).Replace($Value, "[REDACTED]")
        throw "Vercel could not set $Name for $Environment. $details"
    }
}

$names = @(
    "DATA_GOV_IN_API_KEY",
    "HEIGIT_API_KEY",
    "OPEN_METEO_CUSTOMER_API_KEY"
)

$targets = @("development", "preview")
if ($IncludeProduction) {
    $targets += "production"
}

Write-Host "This writes provider credentials to .env.local and Vercel Secret variables."
Write-Host "Production is excluded unless -IncludeProduction is supplied."
Write-Host "Press Enter at a prompt to skip a provider you have not configured yet."

foreach ($name in $names) {
    $secure = Read-Host ("Enter " + $name + " (input hidden; Enter to skip)") -AsSecureString
    $plain = $null

    try {
        $plain = [System.Net.NetworkCredential]::new("", $secure).Password
        if ([string]::IsNullOrWhiteSpace($plain)) {
            Write-Host ($name + ": skipped")
            continue
        }

        Set-LocalEnvironmentValue -Name $name -Value $plain
        Write-Host ($name + ": saved to local .env.local")

        foreach ($target in $targets) {
            Set-VercelSecretFromPipe -Name $name -Environment $target -Value $plain
            Write-Host ($name + ": Vercel " + $target + " Secret updated")
        }
    }
    catch {
        Write-Warning ($name + ": " + $_.Exception.Message)
        throw
    }
    finally {
        $plain = $null
        if ($secure) { $secure.Dispose() }
    }
}

Write-Host ""
Write-Host "Completed. Restart the local Next.js server after changing .env.local."
Write-Host "Vercel changes apply to new deployments; trigger a new preview deployment to test them."
