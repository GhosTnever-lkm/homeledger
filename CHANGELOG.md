# Changelog

## 0.1.4 - 2026-10-13

- Keep HomeLedger usable when browser storage access is restricted: blocked theme storage no longer aborts startup or the theme toggle.

## 0.1.3 - 2026-10-13

- Reject duplicate IDs in imported backups so one record cannot silently overwrite another in IndexedDB.
- Keep confirmed localStorage fallback data authoritative after an IndexedDB write failure, then clear the fallback only after IndexedDB successfully saves again.
- Apply item edits and backup restores to the visible app state only after persistence succeeds.
- Remove an internal development-process note from the user documentation.

## 0.1.2 - 2026-10-13

- Make the release workflow upload archives to an existing GitHub release or create a new release when needed.
- Align the VERSION file with the published package version.

## 0.1.1 - 2026-10-11

- Add a real screenshot of the app to the README.

## 0.1.0 - 2026-10-10

- Initial public release.
