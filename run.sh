#!/usr/bin/env bash
# Trivy VEX demo - end-to-end runner (bash / Git Bash / WSL)
# Usage: ./run.sh [-y]   (-y = no pauses)
set -euo pipefail

# Git Bash (MSYS) would otherwise mangle /var/run/docker.sock
export MSYS_NO_PATHCONV=1

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR"

NO_PAUSE=${1:-}
RED=$'\033[1;31m'; GREEN=$'\033[1;32m'; YELLOW=$'\033[1;33m'
MAGENTA=$'\033[1;35m'; CYAN=$'\033[1;36m'; BOLD=$'\033[1m'; RESET=$'\033[0m'

IMAGE="pingidentity/pingaccess:8.3.4-edge"
DERIVED="pingaccess-vex:8.3.4-edge-demo"
SOCK=(-v /var/run/docker.sock:/var/run/docker.sock)
CACHE=(-v trivy-cache:/root/.cache/trivy)
WORK=(-v "$SCRIPT_DIR:/work")
CONF=(-v "$SCRIPT_DIR/trivy-config:/root/.trivy/vex")

step() { printf '\n%s=== Step %s — %s ===%s\n' "$CYAN" "$1" "$2" "$RESET"; }
ok()   { printf '%s✔ %s%s\n' "$GREEN" "$1" "$RESET"; }
pause() {
  [ "$NO_PAUSE" = "-y" ] && return 0
  printf '%sPress Enter to continue (Ctrl+C to abort)...%s' "$YELLOW" "$RESET"
  read -r _
  clear 2>/dev/null || printf '\033[2J\033[H'
}
counts() { # counts <report.json> -> "findings=N suppressed=M"
  docker run --rm "${WORK[@]}" vex-toolchain:latest \
    jq -r '"findings=\([.Results[].Vulnerabilities[]?] | length) suppressed=\([.Results[].ExperimentalModifiedFindings[]?] | length)"' "/work/$1"
}
show_results() { # show_results <report.json> <label> — color-coded severity breakdown
  local file=$1 label=$2 sev n c
  printf '  %s%s%s\n' "$BOLD" "$label" "$RESET"
  docker run --rm "${WORK[@]}" vex-toolchain:latest jq -r '
    (reduce (.Results[].Vulnerabilities[]?.Severity) as $s
       ({"CRITICAL":0,"HIGH":0,"MEDIUM":0,"LOW":0,"UNKNOWN":0}; .[$s] += 1)
     | to_entries[] | select(.key != "UNKNOWN" or .value > 0)
     | "\(.key) \(.value)"),
    "SUPPRESSED \([.Results[].ExperimentalModifiedFindings[]?] | length)"
    ' "/work/$file" | while read -r sev n; do
    case $sev in
      CRITICAL)   c=$RED;;
      HIGH)       c=$MAGENTA;;
      MEDIUM)     c=$YELLOW;;
      LOW)        c=$CYAN;;
      SUPPRESSED) c=$GREEN;;
      *)          c=$RESET;;
    esac
    printf '    %s%-10s %4s%s\n' "$c" "$sev" "$n" "$RESET"
  done
}

printf '%s Trivy VEX demo — %s %s\n' "$BOLD" "$IMAGE" "$RESET"

step 1 "Preflight: docker available?"
docker info --format '{{.ServerVersion}} ({{.OSType}}/{{.Architecture}})'
ok "docker is up"
pause

step 2 "Build toolchain image (trivy + vexctl + Docker Scout)"
docker build -t vex-toolchain:latest toolchain/
docker run --rm vex-toolchain:latest trivy --version | head -1
docker run --rm vex-toolchain:latest vexctl version 2>&1 | grep GitVersion
docker run --rm "${SOCK[@]}" vex-toolchain:latest docker scout version 2>&1 | head -3 || \
  printf '%s[NOTE] docker scout version failed — Scout commands will run on the host instead.\n        Install Scout: https://docs.docker.com/scout/install/%s\n' "$YELLOW" "$RESET"
ok "vex-toolchain:latest built"
# Check containerd image store — required for Scout attestations (steps 9-11).
# If not active those steps are skipped automatically; all other steps continue.
printf '  Checking containerd image store... '
if docker info 2>/dev/null | grep -q "containerd-snapshotter: true"; then
  CONTAINERD_ACTIVE=1
  printf '%sactive%s\n' "$GREEN" "$RESET"
else
  CONTAINERD_ACTIVE=0
  printf '%snot detected — Scout attestation steps (9-11) will be skipped%s\n' "$YELLOW" "$RESET"
fi
pause

step 3 "Pull base image and show digest"
docker pull "$IMAGE"
docker image inspect "$IMAGE" --format '{{index .RepoDigests 0}}'
ok "image pulled"
pause

step 4 "Baseline scan -> baseline-report.json / baseline-summary.txt"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --format json --output /work/baseline-report.json "$IMAGE"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format table --output /work/baseline-summary.txt "$IMAGE"
show_results baseline-report.json "Baseline results"
ok "baseline saved"
pause

step 5 "Generate OpenVEX statements — pkg:oci (Trivy/Wiz) + pkg:docker (Scout)"
docker run --rm "${WORK[@]}" vex-toolchain:latest \
  sh -c "tr -d '\r' < /work/scripts/generate-vex.sh > /tmp/g.sh && sh /tmp/g.sh" | tail -6
ok "vex/statements/*.openvex.json   (Trivy/Wiz channel, pkg:oci)"
ok "vex/statements-scout/*.vex.json (Scout channel, pkg:docker)"
pause

step 6 "Assemble VEX repository (spec v0.1 archive)"
mkdir -p vex-repo-src/pkg/oci/pingaccess vex-repo/v0.1
cp vex/pingaccess-8.3.4-edge.openvex.json vex-repo-src/pkg/oci/pingaccess/vex.json
docker run --rm "${WORK[@]}" vex-toolchain:latest \
  sh -c "cd /work/vex-repo-src && tar -czf /work/vex-repo/v0.1/vex-data.tar.gz index.json pkg && tar -tzf /work/vex-repo/v0.1/vex-data.tar.gz"
ok "vex-repo/v0.1/vex-data.tar.gz rebuilt"
pause

step 7 "Serve repository (nginx on docker network 'vexnet')"
docker network create vexnet 2>/dev/null || true
docker rm -f vex-server >/dev/null 2>&1 || true
docker run -d --name vex-server --network vexnet \
  -v "$SCRIPT_DIR/vex-repo:/usr/share/nginx/html:ro" nginx:alpine >/dev/null
docker run --rm --network vexnet vex-toolchain:latest \
  sh -c "curl -fsS http://vex-server/.well-known/vex-repository.json | jq -c .versions[0]"
ok "vex-server is serving the manifest"
pause

step 8 "Register repo in Trivy and download it"
docker run --rm --network vexnet "${CACHE[@]}" "${CONF[@]}" vex-toolchain:latest \
  sh -c "trivy vex repo list && trivy clean --vex-repo >/dev/null 2>&1 && trivy vex repo download"
ok "trivy resolved the repository"
pause

step 9 "Scout Phase 5a — dry-run CVE scan with local VEX docs"
if [ "$CONTAINERD_ACTIVE" = "0" ]; then
  printf '%sSkipped — containerd image store not active.%s\n' "$YELLOW" "$RESET"
elif command -v docker >/dev/null && docker scout version >/dev/null 2>&1; then
  docker scout cves "$IMAGE" --vex-location "$SCRIPT_DIR/vex" 2>&1 | tail -30 || {
    printf '%s[NOTE] docker scout cves failed. If auth is needed: docker login%s\n' "$YELLOW" "$RESET"
  }
  ok "not_affected CVEs should be absent from the Scout output above"
else
  printf '%s[NOTE] docker scout not found on this host. Install: https://docs.docker.com/scout/install/%s\n' "$YELLOW" "$RESET"
fi
pause

step 10 "Scout Phase 5b — local registry + push + Scout VEX attestations"
if [ "$CONTAINERD_ACTIVE" = "0" ]; then
  printf '%sSkipped — containerd image store not active.%s\n' "$YELLOW" "$RESET"
else
  SCOUT_REG="localhost:5000"
  SCOUT_IMAGE="${SCOUT_REG}/pingidentity/pingaccess:8.3.4-edge"
  docker rm -f vex-registry >/dev/null 2>&1 || true
  docker run -d -p 5000:5000 --name vex-registry registry:2 >/dev/null
  ok "local registry:2 started on port 5000"
  docker tag "$IMAGE" "$SCOUT_IMAGE"
  docker push "$SCOUT_IMAGE"
  ok "pushed $SCOUT_IMAGE"
  for VEX_FILE in "$SCRIPT_DIR"/vex/statements-scout/*.vex.json; do
    CVE=$(basename "$VEX_FILE" .vex.json)
    docker scout attestation add \
      --file "$VEX_FILE" \
      --predicate-type https://openvex.dev/ns/v0.2.0 \
      "$SCOUT_IMAGE" || \
      printf '%s[NOTE] attestation add failed for %s — registry:2 may not support OCI artifacts%s\n' "$YELLOW" "$CVE" "$RESET"
  done
  ok "Scout VEX attestations attached to $SCOUT_IMAGE"
fi
pause

step 11 "Scout Phase 5c — re-scan to prove Scout suppression"
if [ "$CONTAINERD_ACTIVE" = "0" ]; then
  printf '%sSkipped — containerd image store not active.%s\n' "$YELLOW" "$RESET"
else
  docker scout cves "$SCOUT_IMAGE" 2>&1 | tee "$SCRIPT_DIR/scout-suppressed-report.txt" || \
    printf '%s[NOTE] scout cves on attested image failed — see scout-suppressed-report.txt%s\n' "$YELLOW" "$RESET"
  ok "scout-suppressed-report.txt saved — not_affected CVEs should be absent"
  printf '  Scout baseline CVE count (pre-attestation): '
  docker scout cves "$IMAGE" 2>&1 | grep -c "CVE-" || echo "unknown"
  printf '  Scout attested CVE count (post-attestation): '
  grep -c "CVE-" "$SCRIPT_DIR/scout-suppressed-report.txt" 2>/dev/null || echo "unknown"
fi
pause

step 12 "Build derived image with embedded VEX (filesystem fallback — see README)"
# IMPORTANT: mutual-exclusivity rule — if the image has ANY attestation (including
# provenance auto-added by BuildKit), Scout ignores filesystem VEX entirely and reads
# only attestations. To use filesystem embed, build with --provenance=false --sbom=false.
docker build -f embed/Dockerfile -t "$DERIVED" . >/dev/null
docker image inspect "$DERIVED" --format 'RepoDigests={{json .RepoDigests}} (empty = local-only, expected)'
ok "$DERIVED built (--provenance/--sbom not passed, so no attestations added)"
pause

step 13 "Trivy suppression proof on the digest-pinned ORIGINAL image"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format json --show-suppressed \
  --vex /work/vex/pingaccess-8.3.4-edge.openvex.json \
  --output /work/suppressed-report.json "$IMAGE"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format table --show-suppressed \
  --vex /work/vex/pingaccess-8.3.4-edge.openvex.json \
  --output /work/suppressed-summary.txt "$IMAGE"
docker run --rm --network vexnet "${SOCK[@]}" "${CACHE[@]}" "${CONF[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format json --show-suppressed --vex repo \
  --output /work/rescan-original-repo.json "$IMAGE"
show_results suppressed-report.json "a) --vex file (original image)"
show_results rescan-original-repo.json "b) --vex repo (original image)"
ok "expected: 0 remaining findings, 70 suppressed for both"
pause

step 14 "Trivy re-scan of the DERIVED image three ways (expected: no suppression)"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format json --show-suppressed \
  --vex /work/vex/pingaccess-8.3.4-edge.openvex.json \
  --output /work/rescan-a-local-vex.json "$DERIVED"
docker run --rm --network vexnet "${SOCK[@]}" "${CACHE[@]}" "${CONF[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format json --show-suppressed --vex repo \
  --output /work/rescan-b-repo.json "$DERIVED"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format json --show-suppressed \
  --output /work/rescan-c-embedded-only.json "$DERIVED"
show_results rescan-a-local-vex.json "a) --vex file (derived image)"
show_results rescan-b-repo.json "b) --vex repo (derived image)"
show_results rescan-c-embedded-only.json "c) embedded VEX only (derived image)"
printf '%sNo suppression: VEX binds to the base digest; local derived images have none,\nand Trivy does not read in-image VEX files.%s\n' "$YELLOW" "$RESET"
pause

step 15 "Summary"
printf '%s%s\n' "$BOLD" "----------------------------------------------"
printf 'baseline     : %s\n' "$(counts baseline-report.json)"
printf 'trivy --vex  : %s\n' "$(counts suppressed-report.json)"
printf 'trivy repo   : %s\n' "$(counts rescan-original-repo.json)"
printf 'scout attest : see scout-suppressed-report.txt (Step 11)\n'
printf '%s%s\n' "----------------------------------------------" "$RESET"
ok "details: comparison.txt, README.md, wiz-integration.md"

if [ "$NO_PAUSE" != "-y" ]; then
  printf '%sTear down vex-server, vex-registry + vexnet now? [y/N] %s' "$YELLOW" "$RESET"
  read -r ANSWER
  if [ "${ANSWER:-n}" = "y" ] || [ "${ANSWER:-n}" = "Y" ]; then
    docker rm -f vex-server vex-registry >/dev/null 2>&1 || true
    docker network rm vexnet >/dev/null 2>&1 || true
    ok "torn down"
  else
    printf 'left running — teardown: docker rm -f vex-server vex-registry && docker network rm vexnet\n'
  fi
fi
printf '%sDone.%s\n' "$GREEN" "$RESET"
