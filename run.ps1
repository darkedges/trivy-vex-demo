# Trivy VEX demo - end-to-end runner (PowerShell 7+)
# Usage: ./run.ps1 [-NoPause]
[CmdletBinding()]
param([switch]$NoPause)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Suppress Docker Scout "new version available" notifications during unattended runs
$env:DOCKER_CLI_HINTS = 'false'

$Image   = 'pingidentity/pingaccess:8.3.4-edge'
$Derived = 'pingaccess-vex:8.3.4-edge-demo'
$HubImage   = if ($env:HUB_IMAGE) { $env:HUB_IMAGE } else { 'darkedges/pingaccess:8.3.4-hi' }
$HubProduct = "pkg:docker/$($HubImage -replace ':','@')"
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
# Detect the digest of the currently-pulled image so the pkg:oci PURL in the
# VEX statements matches what Trivy will see when it scans the same image.
$OciDigest = docker image inspect $Image --format '{{index .RepoDigests 0}}' 2>$null
if ($OciDigest) {
    $OciDigest = $OciDigest -replace '.*@', ''
    Write-Host "  Image digest: $OciDigest" -ForegroundColor White
} else {
    Write-Host '[WARN] Could not detect image digest — generate-vex.sh will use its hardcoded fallback' -ForegroundColor Yellow
    $OciDigest = ''
}
docker run --rm -e "PRODUCT_OCI_DIGEST=$OciDigest" -e "PRODUCT_DOCKER_HUB=$HubProduct" @Work vex-toolchain:latest `
    sh -c "tr -d '\r' < /work/scripts/generate-vex.sh > /tmp/g.sh && sh /tmp/g.sh" | Select-Object -Last 8
Assert-LastExit
Ok 'vex/statements/*.openvex.json                (Trivy/Wiz, pkg:oci)'
Ok 'vex/statements-scout/*.vex.json             (Scout / Docker Hub pingidentity, pkg:docker)'
Ok 'vex/statements-scout-local/*.vex.json        (Scout / localhost:5000, pkg:docker)'
Ok "vex/statements-scout-darkedges/*.vex.json    (Scout / Docker Hub $HubImage, pkg:docker)"
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

Step 9 'Scout Phase 5a — preflight: check original image for attestations (mutex rule)'
if (-not $containerdActive) {
    Write-Host 'Skipped — containerd image store not active.' -ForegroundColor Yellow
} else {
    $scoutOk = $null
    try { $scoutOk = docker scout version 2>&1 } catch {}
    if (-not $scoutOk) {
        Write-Host '[NOTE] docker scout not found. Install: https://docs.docker.com/scout/install/' -ForegroundColor Yellow
    } else {
        # Mutex rule (Gotcha 5 + 10): if the image has ANY attestation (provenance, SBOM),
        # Scout ignores ALL external VEX sources — both --vex-location and filesystem VEX.
        # pingidentity/pingaccess:8.3.4-edge has NO attestations (confirmed via
        # docker scout attestation list), so the mutex rule is not triggered here.
        # Suppression via --vex-location still does not work for this image due to
        # Scout <=1.20.0 behaviour (Gotcha 11). The attestation path (Steps 10-11) is
        # the only confirmed working Scout suppression mechanism.
        Write-Host ("  Checking {0} for attestations..." -f $Image) -ForegroundColor White
        $origAttest = docker scout attestation list $Image 2>&1
        $origAttest | Select-String -Pattern 'SBOM|Provenance|openvex|predicate|No attestation' -CaseSensitive:$false `
            | ForEach-Object { Write-Host "  $_" }
        $hasAttest = ($origAttest | Select-String -Pattern 'SBOM|Provenance|openvex|predicate' -CaseSensitive:$false).Count -gt 0
        if ($hasAttest) {
            Write-Host '[NOTE] Mutex rule active: original image has attestations.' -ForegroundColor Yellow
            Write-Host '       --vex-location is ignored by Scout when attestations are present.' -ForegroundColor Yellow
            Write-Host '       Suppression will be demonstrated via the attestation path in Steps 10-11.' -ForegroundColor Yellow
        } else {
            Write-Host '  No attestations on original image — --vex-location would apply.' -ForegroundColor Green
            Write-Host '  (Skipping dry-run scan; suppression proof is in Steps 10-11.)' -ForegroundColor White
        }
    }
}
Wait-Step

Step 10 'Scout Phase 5b — build with provenance+SBOM, then attach VEX attestation'
if (-not $containerdActive) {
    Write-Host 'Skipped — containerd image store not active.' -ForegroundColor Yellow
} else {
    $ScoutReg = 'localhost:5000'
    $ScoutImage = "$ScoutReg/pingidentity/pingaccess:8.3.4-edge"
    docker rm -f vex-registry 2>$null | Out-Null
    docker run -d -p 5000:5000 --name vex-registry registry:2 | Out-Null; Assert-LastExit
    Ok 'local registry:2 started on port 5000'

    # Build a minimal derived image with provenance+SBOM attestations.
    # Per https://docs.docker.com/scout/how-tos/create-exceptions-vex/#attestation
    # this creates the OCI manifest-list structure that docker scout attestation add
    # requires before it can attach VEX alongside provenance and SBOM.
    # embed/Dockerfile-scout is a bare FROM — no filesystem VEX, which would trigger
    # the attestation-vs-filesystem mutex rule and cause Scout to ignore the VEX.
    Write-Host "  Building $ScoutImage with --provenance=true --sbom=true..." -ForegroundColor White
    docker build --provenance=true --sbom=true --tag $ScoutImage --push -f embed\Dockerfile-scout .; Assert-LastExit
    Ok "pushed $ScoutImage with provenance+SBOM attestations"
    # Inspect manifest structure — must be an OCI Image Index (manifest list) for
    # docker scout attestation add to attach alongside provenance+SBOM.
    Write-Host '  Manifest structure:' -ForegroundColor White
    docker buildx imagetools inspect $ScoutImage --raw 2>&1 `
        | ConvertFrom-Json -ErrorAction SilentlyContinue `
        | Select-Object -ExpandProperty manifests `
        | ForEach-Object { Write-Host ("    {0}  {1}" -f $_.mediaType, $_.digest) }

    # Attach VEX as a third attestation alongside provenance and SBOM.
    # Use the localhost:5000 PURL variants — Scout resolves the full registry
    # hostname when matching VEX statements, so Docker Hub PURLs won't match.
    $vexFiles = @(Get-ChildItem "$PSScriptRoot\vex\statements-scout-local\*.vex.json")
    $attached = 0
    $vexFiles | ForEach-Object {
        $vexFile = $_.FullName
        $cve = $_.BaseName
        Write-Host ("  attaching {0}..." -f $cve) -ForegroundColor White -NoNewline
        docker scout attestation add --file $vexFile --predicate-type https://openvex.dev/ns/v0.2.0 $ScoutImage 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host ' ✔' -ForegroundColor Green
            $attached++
        } else {
            Write-Host ' FAILED' -ForegroundColor Yellow
        }
    }
    Write-Host ("  {0} / {1} attestations attached" -f $attached, $vexFiles.Count) -ForegroundColor White

    # Probe the OCI Image Index directly for attestation manifests.
    # Docker Scout attestations are stored as additional manifests inside the Image
    # Index annotated with vnd.docker.reference.type: attestation-manifest. They are
    # NOT stored via the OCI Referrers API (/referrers/); registry:2 returns 404 for
    # that endpoint because Scout uses the Image Index model, not the Referrers model.
    Write-Host '  Probing OCI Image Index for attestation manifests...' -ForegroundColor White
    $referrersFoundViaApi = $false
    $referrersVexCount = 0
    try {
        $indexJson = Invoke-RestMethod `
            -Uri "http://localhost:5000/v2/pingidentity/pingaccess/manifests/8.3.4-edge" `
            -Headers @{ Accept = 'application/vnd.oci.image.index.v1+json' } `
            -ErrorAction Stop
        if ($indexJson.manifests) {
            $totalManifests = @($indexJson.manifests).Count
            $attestManifests = @($indexJson.manifests | Where-Object {
                $_.annotations.'vnd.docker.reference.type' -eq 'attestation-manifest'
            })
            $referrersVexCount = $attestManifests.Count
            Write-Host ("  Image Index: {0} manifest(s), {1} attestation(s)" -f $totalManifests, $referrersVexCount) -ForegroundColor White
            @($indexJson.manifests) | ForEach-Object {
                $refType = if ($_.annotations.'vnd.docker.reference.type') { $_.annotations.'vnd.docker.reference.type' } else { 'image' }
                Write-Host ("    {0}  {1}  {2}..." -f $_.mediaType, $refType, $_.digest.Substring(0, 19)) -ForegroundColor Cyan
            }
            $referrersFoundViaApi = $referrersVexCount -gt 0
        }
    } catch {
        Write-Host "  Could not read Image Index: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    # docker scout attestation list: may show "No attestations found" on Windows
    # even when attestations exist — Windows Docker resolves to the platform manifest
    # digest, not the OCI Image Index digest where referrers are stored.
    Write-Host '  docker scout attestation list (may false-negative on Windows)...' -ForegroundColor White
    $attestCheck = docker scout attestation list $ScoutImage 2>&1
    $attestCheck | Select-String -Pattern 'openvex|predicate|SBOM obtained|Provenance obtained|No attestation' -CaseSensitive:$false `
        | ForEach-Object { Write-Host ("  $_") }
    $scoutFoundAttest = ($attestCheck | Select-String -Pattern 'openvex|predicate|SBOM obtained' -CaseSensitive:$false).Count -gt 0

    if ($referrersFoundViaApi -or $scoutFoundAttest) {
        Ok ("Scout attestations confirmed ({0} attestation manifest(s) in Image Index)" -f $referrersVexCount)
        if (-not $scoutFoundAttest) {
            Write-Host '  [INFO] docker scout attestation list shows none on Windows — known manifest resolution' -ForegroundColor Yellow
            Write-Host '         difference: Windows resolves to platform manifest, WSL to OCI Image Index.' -ForegroundColor Yellow
            Write-Host '         Verify in WSL: docker scout attestation list ' + $ScoutImage -ForegroundColor Yellow
        }
    } else {
        Write-Host '[NOTE] No attestations found in registry — step 11 will use --vex-location fallback.' -ForegroundColor Yellow
    }
}
Wait-Step

Step 11 'Scout Phase 5c — re-scan to prove Scout suppression'
if (-not $containerdActive) {
    Write-Host 'Skipped — containerd image store not active.' -ForegroundColor Yellow
} else {
    $scoutReport = "$PSScriptRoot\scout-suppressed-report.txt"
    # Use the referrers API (authoritative) to decide the scan path — NOT
    # docker scout attestation list, which shows "No attestations found" on
    # Windows because Windows Docker resolves the tag to the platform manifest
    # digest rather than the OCI Image Index digest where referrers are stored.
    $attestFound = $referrersFoundViaApi -or $scoutFoundAttest
    if ($attestFound) {
        Write-Host '  Attestations confirmed in registry — scanning without --vex-location.' -ForegroundColor Green
        Write-Host '  Note: on Windows, docker scout cves may still not apply attestations (same manifest' -ForegroundColor Yellow
        Write-Host '        resolution difference as attestation list). Suppression is verified in WSL.' -ForegroundColor Yellow
        docker scout cves $ScoutImage 2>&1 | Tee-Object -FilePath $scoutReport
    } else {
        Write-Host '  No attestations in registry — using --vex-location with localhost:5000 PURL files.' -ForegroundColor Yellow
        docker scout cves $ScoutImage --vex-location "$PSScriptRoot\vex\pingaccess-scout-local.vex.json" 2>&1 | Tee-Object -FilePath $scoutReport
    }
    Ok 'scout-suppressed-report.txt saved'
    $remaining = @(Get-Content $scoutReport | Select-String '^\s*CVE-').Count
    Write-Host "  Remaining CVEs: $remaining"
    Write-Host '  Note: CVE-2026-* entries are new post-baseline discoveries with no VEX statements — expected to remain.' -ForegroundColor Yellow
}
Wait-Step

Step 12 'Scout Phase 5d — attach VEX attestations to Docker Hub image (optional)'
# Attaches the Phase 3d VEX set (pkg:docker/<org>/... PURL) to the Docker Hub image
# so scout.docker.com indexes the suppression. Requires HubImage to be published on
# Docker Hub; skips gracefully if not accessible or statements not yet generated.
$VexHubFile = Join-Path $PSScriptRoot 'vex\pingaccess-scout-darkedges.vex.json'
Write-Host "  Target : $HubImage" -ForegroundColor White
Write-Host "  Product: $HubProduct" -ForegroundColor White
if (-not (Test-Path $VexHubFile)) {
    Write-Host "  [SKIP] $VexHubFile not found — re-run Step 5 first." -ForegroundColor Yellow
} else {
    docker scout attestation add `
        --file $VexHubFile `
        --predicate-type https://openvex.dev/ns/v0.2.0 `
        $HubImage 2>&1
    if ($LASTEXITCODE -eq 0) {
        Ok "$HubImage — consolidated VEX attestation attached"
        Write-Host '  scout.docker.com will re-index the image within a few minutes.' -ForegroundColor White
        Write-Host "  To verify: docker scout cves $HubImage" -ForegroundColor White
    } else {
        Write-Host "  [SKIP] Attestation add failed — is $HubImage published on Docker Hub and logged in?" -ForegroundColor Yellow
        Write-Host "  Publish: docker tag $Image $HubImage; docker push $HubImage" -ForegroundColor White
    }
}
Wait-Step

Step 13 'Build derived image with embedded VEX (filesystem fallback — see README)'
# IMPORTANT: mutual-exclusivity rule — if the image has ANY attestation (including
# provenance auto-added by BuildKit), Scout ignores filesystem VEX entirely and reads
# only attestations. Build with --provenance=false --sbom=false to use filesystem embed.
docker build -f embed/Dockerfile -t $Derived . | Out-Null; Assert-LastExit
docker image inspect $Derived --format 'RepoDigests={{json .RepoDigests}} (empty = local-only, expected)'
Ok "$Derived built"
Wait-Step

Step 14 'Trivy suppression proof on the digest-pinned ORIGINAL image'
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

Step 15 'Trivy re-scan of the DERIVED image three ways (expected: no suppression)'
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

Step 16 'Summary'
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
