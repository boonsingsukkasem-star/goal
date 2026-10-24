# Dependency security patches

## `image-size@1.2.1`

Expo/Metro currently resolves `image-size@1.2.1`. The upstream package has two high-severity
denial-of-service advisories with no patched release:

- CVE-2025-71329 / GHSA-5p2g-fcmc-qvqq
- CVE-2025-71330 / GHSA-w3rx-r6r6-pgpr

The repository patch in `patches/image-size@1.2.1.patch` rejects zero or undersized ISO BMFF
boxes and invalid ICNS entry lengths before parser offsets are advanced. `pnpm test:security`
contains regression checks for both parser paths.

`pnpm audit:prod` ignores only these two CVEs after the local mitigation. Remove the patch and
the audit exclusions as soon as Expo/Metro resolves an upstream patched release.

## Overrides

- `js-yaml` is forced to `5.2.2`, the patched release for CVE-2026-73643.
- `uuid` is forced to `11.1.1`, the patched release for CVE-2026-41907.
