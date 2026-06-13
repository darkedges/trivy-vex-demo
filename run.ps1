# Trivy VEX demo - end-to-end runner (PowerShell 7+)
# Usage: ./run.ps1 [-NoPause]
[CmdletBinding()]
param([switch]$NoPause)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$Image   = 'pingidentity/pingaccess:8.3.4-edge'
$Derived = 'pingaccess-vex:8.3.4-edge-demo'
$Sock  = @('-v', '/var/run/docker.sock:/var/run/docker.sock')
$Cache = @('-v', 'trivy-cache:/root/.cache/trivy')
$Work  = @('-v', "${PSScriptRoot}:/work")
$Conf  = @('-v', "${PSScriptRoot}\trivy-config:/root/.trivy/vex")

function Step([int]$N, [string]$Title) {
    Write-Host ""
    Write-Host "=== Step $N — $Title ===" -ForegroundColor Cyan
}
function Ok([string]$Msg) { Write-Host "✔ $Msg" -ForegroundColor Green }
function Wait-Step {
    if ($NoPause) { return }
    Write-Host 'Press Enter to continue (Ctrl+C to abort)...' -ForegroundColor Yellow -NoNewline
    [void](Read-Host)
    Clear-Host
}
function Get-Counts([string]$Report) {
    $r = Get-Content (Join-Path $PSScriptRoot $Report) -Raw | ConvertFrom-Json
    $f = @($r.Results | ForEach-Object { $_.Vulnerabilities } | Where-Object { $_ }).Count
    $s = @($r.Results | ForEach-Object { $_.ExperimentalModifiedFindings } | Where-Object { $_ }).Count
    "findings=$f suppressed=$s"
}
function Assert-LastExit { if ($LASTEXITCODE -ne 0) { throw "command failed (exit $LASTEXITCODE)" } }
function Show-Results([string]$Report, [string]$Label) {
    # Color-coded severity breakdown of remaining findings + suppressed count
    Write-Host "  $Label" -ForegroundColor White
    $r = Get-Content (Join-Path $PSScriptRoot $Report) -Raw | ConvertFrom-Json
    $sevs = @($r.Results | ForEach-Object { $_.Vulnerabilities } | Where-Object { $_ } | ForEach-Object { $_.Severity })
    $suppressed = @($r.Results | ForEach-Object { $_.ExperimentalModifiedFindings } | Where-Object { $_ }).Count
    $colors = [ordered]@{ CRITICAL = 'Red'; HIGH = 'Magenta'; MEDIUM = 'Yellow'; LOW = 'Cyan' }
    foreach ($k in $colors.Keys) {
        $n = @($sevs | Where-Object { $_ -eq $k }).Count
        Write-Host ('    {0,-10} {1,4}' -f $k, $n) -ForegroundColor $colors[$k]
    }
    $unknown = @($sevs | Where-Object { $_ -notin @($colors.Keys) }).Count
    if ($unknown) { Write-Host ('    {0,-10} {1,4}' -f 'UNKNOWN', $unknown) -ForegroundColor Gray }
    Write-Host ('    {0,-10} {1,4}' -f 'SUPPRESSED', $suppressed) -ForegroundColor Green
}

Write-Host "Trivy VEX demo — $Image" -ForegroundColor White

Step 1 'Preflight: docker available?'
docker info --format '{{.ServerVersion}} ({{.OSType}}/{{.Architecture}})'; Assert-LastExit
Ok 'docker is up'
Wait-Step

Step 2 'Build toolchain image (trivy + vexctl)'
docker build -t vex-toolchain:latest toolchain/; Assert-LastExit
docker run --rm vex-toolchain:latest trivy --version | Select-Object -First 1
docker run --rm vex-toolchain:latest vexctl version 2>&1 | Select-String GitVersion
Ok 'vex-toolchain:latest built'
Wait-Step

Step 3 'Pull base image and show digest'
docker pull $Image; Assert-LastExit
docker image inspect $Image --format '{{index .RepoDigests 0}}'
Ok 'image pulled'
Wait-Step

Step 4 'Baseline scan -> baseline-report.json / baseline-summary.txt'
docker run --rm @Sock @Cache @Work vex-toolchain:latest `
    trivy image --quiet --format json --output /work/baseline-report.json $Image; Assert-LastExit
docker run --rm @Sock @Cache @Work vex-toolchain:latest `
    trivy image --quiet --skip-db-update --format table --output /work/baseline-summary.txt $Image; Assert-LastExit
Show-Results 'baseline-report.json' 'Baseline results'
Ok 'baseline saved'
Wait-Step

Step 5 'Generate OpenVEX statements (one per CVE) + merged document'
docker run --rm @Work vex-toolchain:latest `
    sh -c "tr -d '\r' < /work/scripts/generate-vex.sh > /tmp/g.sh && sh /tmp/g.sh" | Select-Object -Last 3
Assert-LastExit
Ok 'vex/statements/*.openvex.json + vex/pingaccess-8.3.4-edge.openvex.json'
Wait-Step

Step 6 'Assemble VEX repository (spec v0.1 archive)'
New-Item -ItemType Directory -Force vex-repo-src\pkg\oci\pingaccess, vex-repo\v0.1 | Out-Null
Copy-Item vex\pingaccess-8.3.4-edge.openvex.json vex-repo-src\pkg\oci\pingaccess\vex.json -Force
docker run --rm @Work vex-toolchain:latest `
    sh -c 'cd /work/vex-repo-src && tar -czf /work/vex-repo/v0.1/vex-data.tar.gz index.json pkg && tar -tzf /work/vex-repo/v0.1/vex-data.tar.gz'
Assert-LastExit
Ok 'vex-repo/v0.1/vex-data.tar.gz rebuilt'
Wait-Step

Step 7 "Serve repository (nginx on docker network 'vexnet')"
docker network create vexnet 2>$null | Out-Null
docker rm -f vex-server 2>$null | Out-Null
docker run -d --name vex-server --network vexnet `
    -v "${PSScriptRoot}\vex-repo:/usr/share/nginx/html:ro" nginx:alpine | Out-Null; Assert-LastExit
docker run --rm --network vexnet vex-toolchain:latest `
    sh -c 'curl -fsS http://vex-server/.well-known/vex-repository.json | jq -c .versions[0]'; Assert-LastExit
Ok 'vex-server is serving the manifest'
Wait-Step

Step 8 'Register repo in Trivy and download it'
docker run --rm --network vexnet @Cache @Conf vex-toolchain:latest `
    sh -c 'trivy vex repo list && trivy clean --vex-repo >/dev/null 2>&1 && trivy vex repo download'; Assert-LastExit
Ok 'trivy resolved the repository'
Wait-Step

Step 9 'Build derived image with embedded VEX'
docker build -f embed/Dockerfile -t $Derived . | Out-Null; Assert-LastExit
docker image inspect $Derived --format 'RepoDigests={{json .RepoDigests}} (empty = local-only, expected)'
Ok "$Derived built"
Wait-Step

Step 10 'Suppression proof on the digest-pinned ORIGINAL image'
docker run --rm @Sock @Cache @Work vex-toolchain:latest `
    trivy image --quiet --skip-db-update --format json --show-suppressed `
    --vex /work/vex/pingaccess-8.3.4-edge.openvex.json `
    --output /work/suppressed-report.json $Image; Assert-LastExit
docker run --rm @Sock @Cache @Work vex-toolchain:latest `
    trivy image --quiet --skip-db-update --format table --show-suppressed `
    --vex /work/vex/pingaccess-8.3.4-edge.openvex.json `
    --output /work/suppressed-summary.txt $Image; Assert-LastExit
docker run --rm --network vexnet @Sock @Cache @Conf @Work vex-toolchain:latest `
    trivy image --quiet --skip-db-update --format json --show-suppressed --vex repo `
    --output /work/rescan-original-repo.json $Image; Assert-LastExit
Show-Results 'suppressed-report.json' 'a) --vex file (original image)'
Show-Results 'rescan-original-repo.json' 'b) --vex repo (original image)'
Ok 'expected: 0 remaining findings, 70 suppressed for both'
Wait-Step

Step 11 'Re-scan the DERIVED image three ways (expected: no suppression)'
docker run --rm @Sock @Cache @Work vex-toolchain:latest `
    trivy image --quiet --skip-db-update --format json --show-suppressed `
    --vex /work/vex/pingaccess-8.3.4-edge.openvex.json `
    --output /work/rescan-a-local-vex.json $Derived; Assert-LastExit
docker run --rm --network vexnet @Sock @Cache @Conf @Work vex-toolchain:latest `
    trivy image --quiet --skip-db-update --format json --show-suppressed --vex repo `
    --output /work/rescan-b-repo.json $Derived; Assert-LastExit
docker run --rm @Sock @Cache @Work vex-toolchain:latest `
    trivy image --quiet --skip-db-update --format json --show-suppressed `
    --output /work/rescan-c-embedded-only.json $Derived; Assert-LastExit
Show-Results 'rescan-a-local-vex.json' 'a) --vex file (derived image)'
Show-Results 'rescan-b-repo.json' 'b) --vex repo (derived image)'
Show-Results 'rescan-c-embedded-only.json' 'c) embedded VEX only (derived image)'
Write-Host 'No suppression here is the documented lesson: VEX binds to the base digest;' -ForegroundColor Yellow
Write-Host 'local derived images have none, and Trivy does not read in-image VEX files.' -ForegroundColor Yellow
Wait-Step

Step 12 'Summary'
Write-Host '----------------------------------------------' -ForegroundColor White
Write-Host "baseline : $(Get-Counts 'baseline-report.json')"
Write-Host "vex file : $(Get-Counts 'suppressed-report.json')"
Write-Host "vex repo : $(Get-Counts 'rescan-original-repo.json')"
Write-Host '----------------------------------------------' -ForegroundColor White
Ok 'details: comparison.txt, README.md, wiz-integration.md'

if (-not $NoPause) {
    Write-Host 'Tear down vex-server + vexnet now? [y/N] ' -ForegroundColor Yellow -NoNewline
    $answer = Read-Host
    if ($answer -match '^[Yy]$') {
        docker rm -f vex-server | Out-Null
        docker network rm vexnet | Out-Null
        Ok 'torn down'
    } else {
        Write-Host 'left running — teardown later with: docker rm -f vex-server; docker network rm vexnet'
    }
}
Write-Host 'Done.' -ForegroundColor Green
