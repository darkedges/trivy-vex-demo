# Feeding this repository's VEX artifacts to Wiz

> Research date: 2026-06-13. No Wiz tenant was contacted; everything below is
> from public Docker/Wiz documentation and blogs. Tenant-specific behaviour
> (docs.wiz.io is login-gated) should be confirmed with your Wiz account team
> before rollout.

## What Wiz supports today (publicly documented)

1. **Automatic OpenVEX ingestion from the registry.** Wiz "automatically
   applies VEX statements with zero configuration" when it scans images that
   carry VEX data, and "pulls from the image's VEX documents" when the scanner
   detects a Docker Hardened Image. The DHI VEX documents Wiz consumes are
   **OpenVEX** documents attached to the image in the registry as in-toto
   attestations (predicate type `https://openvex.dev/ns/v0.2.0`).
   - Sources: [Docker: Reduce Vulnerability Noise with VEX: Wiz + DHI](https://www.docker.com/blog/reduce-vulnerability-noise-with-vex-wiz-docker-hardened-images/),
     [Docker DHI scanner integrations](https://docs.docker.com/dhi/explore/scanner-integrations/),
     [Docker: Hardened Images Are Free. Now What?](https://www.docker.com/blog/hardened-images-free-now-what/)
2. **No `--vex` style CLI flag.** Unlike Trivy/Grype, `wizcli scan
   container-image <image>` takes no local VEX file; ingestion happens from
   attestations discovered alongside the image. There is no public evidence
   that Wiz polls VEX *repositories* (the aquasecurity vex-repo-spec is a
   Trivy-ecosystem mechanism, not a Wiz one).
3. **Format constraint.** The publicly documented Wiz intake format is
   **OpenVEX**. No public documentation indicates CSAF is *required* for this
   workflow, so **no CSAF rendition is produced** in this POC — the OpenVEX
   originals are the artifact of record. If your tenant's docs show a
   CSAF-only intake path, the consolidated document can be converted at that
   point.

## How to feed THIS repo's artifacts to Wiz

The artifacts:

- `vex/pingaccess-8.3.4-edge.openvex.json` — consolidated OpenVEX document
  (51 statements, product = `pkg:oci/pingaccess@sha256:51689e8c…`)
- `vex/statements/<ID>.openvex.json` — one OpenVEX document per CVE/GHSA
- `vex-repo/`, `vex-repo-src/` — Trivy-consumable VEX repository (Trivy-only)

### Recommended path: attach the consolidated document as an OCI attestation

Attach the consolidated OpenVEX document to the image **in the registry Wiz
scans**, using the OpenVEX predicate type. Either tool works:

```bash
# Docker Scout (the method Docker's article recommends)
docker scout attestation add \
  --file ./vex/pingaccess-8.3.4-edge.openvex.json \
  --predicate-type https://openvex.dev/ns/v0.2.0 \
  <registry>/<org>/pingaccess:8.3.4-edge

# or cosign
cosign attest \
  --predicate ./vex/pingaccess-8.3.4-edge.openvex.json \
  --type openvex \
  <registry>/<org>/pingaccess@sha256:51689e8ccf1ec6bef28c855a2f2fafdd3556f753609adad2e258580e3bc9397c
```

Wiz's registry/CLI scanning then discovers and applies the statements with no
further configuration, exactly as it does for DHI images. Use the
**consolidated** document for attestation (one attestation, all 51
statements); the per-CVE files exist for review/audit granularity and for the
Trivy VEX repository.

### Constraints to respect

- **Digest addressing.** Statements identify the product by image digest
  (`pkg:oci` purl), not tag — already the case in this repo. An attestation is
  bound to a digest; re-attach after any rebuild (the digest changes).
- **Signing.** `cosign attest` signs; environments enforcing verification
  need the signing key/identity registered. `docker scout attestation add`
  attaches unsigned attestations.
- **Justification values.** OpenVEX justifications
  (`vulnerable_code_not_in_execute_path`, etc.) map onto Wiz's finding
  triage; the DEMO note in `status_notes` travels with each statement so a
  Wiz analyst sees these are POC assessments, not real analysis.

### Alternatives if attestation ingestion is unavailable in your tenant

- **Wiz API / manual exceptions:** Wiz supports creating vulnerability
  exceptions via its GraphQL API; the per-CVE OpenVEX files map 1:1 onto
  exception records (CVE id, resource = image digest, reason = justification
  + status note). This requires tenant API access and is not automated here.
- **Embedded files:** Phase 5 of this POC embeds the VEX document at
  `/usr/share/vex/` inside the image. Treat this as informational for Wiz —
  there is no public documentation that Wiz reads VEX from the image
  *filesystem* (DHI ingestion is attestation-based).

## Not done here (by design)

- No connection to any Wiz tenant, no uploads, no registry pushes.
- No CSAF rendition (not publicly required — see above).
