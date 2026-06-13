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

Step 2 'Build toolchain image (trivy + vexctl + Docker Scout)'
docker build -t vex-toolchain:latest toolchain/; Assert-LastExit
docker run --rm vex-toolchain:latest trivy --version | Select-Object -First 1
docker run --rm vex-toolchain:latest vexctl version 2>&1 | Select-String GitVersion
docker run --rm @Sock vex-toolchain:latest docker scout version 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
    Ok 'Docker Scout plugin verified in toolchain container'
} else {
    Write-Host '[NOTE] docker scout not found in toolchain container — rebuild: docker build -t vex-toolchain:latest toolchain/' -ForegroundColor Yellow
}
Ok 'vex-toolchain:latest built'
# Check containerd image store — required for Scout attestations (steps 9-11).
# If not active those steps are skipped automatically; all other steps continue.
Write-Host '  Checking containerd image store... ' -NoNewline
$containerdActive = (docker info 2>$null | Select-String -Pattern 'io\.containerd\.snapshotter|containerd.?snapshotter.*true').Count -gt 0
if ($containerdActive) {
    Write-Host 'active' -ForegroundColor Green
} else {
    Write-Host 'not detected — Scout attestation steps (9-11) will be skipped' -ForegroundColor Yellow
}
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

Step 5 'Generate OpenVEX statements — pkg:oci (Trivy/Wiz) + pkg:docker (Scout)'
docker run --rm @Work vex-toolchain:latest `
    sh -c "tr -d '\r' < /work/scripts/generate-vex.sh > /tmp/g.sh && sh /tmp/g.sh" | Select-Object -Last 6
Assert-LastExit
Ok 'vex/statements/*.openvex.json   (Trivy/Wiz channel, pkg:oci)'
Ok 'vex/statements-scout/*.vex.json (Scout channel, pkg:docker)'
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

Step 9 'Scout Phase 5a — dry-run CVE scan with local VEX docs'
if (-not $containerdActive) {
    Write-Host 'Skipped — containerd image store not active.' -ForegroundColor Yellow
} else {
    $scoutOk = $null
    try { $scoutOk = docker scout version 2>&1 } catch {}
    if ($scoutOk) {
        try {
            docker scout cves $Image --vex-location "$PSScriptRoot\vex" 2>&1 | Select-Object -Last 30
            Ok 'not_affected CVEs should be absent from the Scout output above'
        } catch {
            Write-Host '[NOTE] docker scout cves failed. If auth needed: docker login' -ForegroundColor Yellow
        }
    } else {
        Write-Host '[NOTE] docker scout not found. Install: https://docs.docker.com/scout/install/' -ForegroundColor Yellow
    }
}
Wait-Step

Step 10 'Scout Phase 5b — local registry + push + Scout VEX attestations'
if (-not $containerdActive) {
    Write-Host 'Skipped — containerd image store not active.' -ForegroundColor Yellow
} else {
    $ScoutReg = 'localhost:5000'
    $ScoutImage = "$ScoutReg/pingidentity/pingaccess:8.3.4-edge"
    docker rm -f vex-registry 2>$null | Out-Null
    docker run -d -p 5000:5000 --name vex-registry registry:2 | Out-Null; Assert-LastExit
    Ok 'local registry:2 started on port 5000'
    docker tag $Image $ScoutImage; Assert-LastExit
    docker push $ScoutImage; Assert-LastExit
    Ok "pushed $ScoutImage"
    Get-ChildItem "$PSScriptRoot\vex\statements-scout\*.vex.json" | ForEach-Object {
        $vexFile = $_.FullName
        $cve = $_.BaseName
        try {
            docker scout attestation add --file $vexFile --predicate-type https://openvex.dev/ns/v0.2.0 $ScoutImage
        } catch {
            Write-Host "[NOTE] attestation add failed for $cve — registry:2 may not support OCI artifacts" -ForegroundColor Yellow
        }
    }
    Ok "Scout VEX attestations attached to $ScoutImage"
}
Wait-Step

Step 11 'Scout Phase 5c — re-scan to prove Scout suppression'
if (-not $containerdActive) {
    Write-Host 'Skipped — containerd image store not active.' -ForegroundColor Yellow
} else {
    $scoutReport = "$PSScriptRoot\scout-suppressed-report.txt"
    try {
        docker scout cves $ScoutImage 2>&1 | Tee-Object -FilePath $scoutReport
        Ok 'scout-suppressed-report.txt saved — not_affected CVEs should be absent'
    } catch {
        Write-Host "[NOTE] scout cves on attested image failed — see scout-suppressed-report.txt" -ForegroundColor Yellow
    }
}
Wait-Step

Step 12 'Build derived image with embedded VEX (filesystem fallback — see README)'
# IMPORTANT: mutual-exclusivity rule — if the image has ANY attestation (including
# provenance auto-added by BuildKit), Scout ignores filesystem VEX entirely and reads
# only attestations. Build with --provenance=false --sbom=false to use filesystem embed.
docker build -f embed/Dockerfile -t $Derived . | Out-Null; Assert-LastExit
docker image inspect $Derived --format 'RepoDigests={{json .RepoDigests}} (empty = local-only, expected)'
Ok "$Derived built"
Wait-Step

Step 13 'Trivy suppression proof on the digest-pinned ORIGINAL image'
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

Step 14 'Trivy re-scan of the DERIVED image three ways (expected: no suppression)'
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
Write-Host 'No suppression: VEX binds to the base digest; local derived images have none,' -ForegroundColor Yellow
Write-Host 'and Trivy does not read in-image VEX files.' -ForegroundColor Yellow
Wait-Step

Step 15 'Summary'
Write-Host '----------------------------------------------' -ForegroundColor White
Write-Host "baseline     : $(Get-Counts 'baseline-report.json')"
Write-Host "trivy --vex  : $(Get-Counts 'suppressed-report.json')"
Write-Host "trivy repo   : $(Get-Counts 'rescan-original-repo.json')"
Write-Host 'scout attest : see scout-suppressed-report.txt (Step 11)' -ForegroundColor White
Write-Host '----------------------------------------------' -ForegroundColor White
Ok 'details: comparison.txt, README.md, wiz-integration.md'

if (-not $NoPause) {
    Write-Host 'Tear down vex-server, vex-registry + vexnet now? [y/N] ' -ForegroundColor Yellow -NoNewline
    $answer = Read-Host
    if ($answer -match '^[Yy]$') {
        docker rm -f vex-server vex-registry 2>$null | Out-Null
        docker network rm vexnet 2>$null | Out-Null
        Ok 'torn down'
    } else {
        Write-Host 'left running — teardown: docker rm -f vex-server vex-registry; docker network rm vexnet'
    }
}
Write-Host 'Done.' -ForegroundColor Green
