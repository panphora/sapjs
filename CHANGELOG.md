# Changelog

## [0.5.0] - 2026-10-14

### Added
- Shared site.css stylesheet used across all pages
- How-it-works page
- New home page
- Guide for building malleable document apps, generated at build time
- Editable rows in each loops
- Presence fields
- Detail dialogs
- Shared blueprints



## [0.4.0] - 2026-10-12

### Added
- `each=`, a keyed projection list
- A 1,000-record `each` benchmark and a CPU profile summarizer
- `data-*` attributes accepted as state fields, and detail panels can write through to them

### Changed
- Rows are keyed by `data-id`, and ids are no longer stamped onto rows at mount
- Mounting waits for `clay.ready`, and detail panels resolve after intake
- Documented `each=`, row keys, `data-*` fields and the `clay.ready` mount
- README explains where paints live in a malleable file (saved paints, freeze scratchpads)
- Rebuilt dist and the explainer bundle

### Fixed
- Move actions in `each` rows
- `data-*` fields whose names look like booleans or reserved words



## [0.3.1] - 2026-09-28

### Changed
- Saving now preserves the author's original markup when the saved content matches the live page state

### Fixed
- A textarea's leading newline is now kept through save and reload



## [0.3.0] - 2026-09-19

### Added
- Deploy script for releases
- SAPJS package to the packed contract
- sapjs llms.txt reference

### Changed
- Include the packed contract in published package files
- clayjs sapjs destination path to entries/sap.js

### Fixed
- Broken npm package link



## [0.2.4] - 2026-08-21

### Changed
- Update sapjs dependency



## [Unreleased]

### Changed
- License: relicensed to MIT-0 (MIT No Attribution). Same rights, attribution no longer required. Covers everything in the repo, including src/control-serialize.js and its vendored copies downstream.



## [0.2.3] - 2026-08-14

### Added
- sapjs dependency updated



## [0.2.2] - 2026-08-12

### Added
- Support for reading platform capabilities from either the `clay` or `hyperclay` namespace
- `kind`, `status`, and `url` declarations in the `hyper` key


