# Changelog

## [0.5.2] - 2026-10-17

### Changed
- Homepage no longer shows the CSP unsafe-eval callout
- Homepage uses plain section headings, adds a "When to use it" section, and renames the explainer to "How it works"
- Homepage restates the large-records limit using the 10,000-row numbers
- Site uses Newsreader instead of Fraunces for headings and all serif text
- Rebuilt dist and docs for inert seed rows
- cms-template seed rows are treated as inert

### Fixed
- W30 is skipped after a visitor draft restore, and warnings are printed as warnings



## [0.5.1] - 2026-10-15

### Changed
- Reworded the sapjs homepage meta description and heading
- The self-contained doc test now allows the polite pop loader, and only that loader
- The polite pop newsletter ask now loads from hyperclay.com
- Doubled the space between the hero demo and its code
- Elements with no directives now share one empty plan

### Fixed
- A change at 10,000 rows now stays under 50 ms because parsed directives are cached



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

## [0.7.0] - 2026-10-30

### Added
- `appOf` and `ownsAttr` take an optional host element, so a subtree just removed from the page keeps walking ancestors from the element it left, and a host can ask whether a detached node's attribute was painted.

### Changed
- A pass reuses the raw record reads it already made instead of reading every record again, so pages with many records re-render faster.
- A plain row that nothing changed keeps its object between passes, saving about 17 ms per keystroke on a 5,000-row Journal. Its fields are written back from that row's last read, and `$key`, `$index` and `$el` stay own and hidden, with `$index` now configurable.
- Sap refuses record writes at their real destinations while ClayJS write admission is closed. Standalone Sap is unchanged.

### Fixed
- A row shown in a `detail=` panel is read fresh on each pass, since the panel may write state onto it.
- A kept row whose field or `$index` a format made read-only is read again instead of throwing.
- Presence fields are restored before declared fields, so a same-name bind still wins.
- A loop guard that halts a runaway render re-arms on the next refresh or interaction, so a burst of typing no longer leaves the app frozen.
- Undo is rebound once per editing session, and a retired scope no longer receives undo callbacks.

## [0.6.0] - 2026-10-23

### Added
- An ownership reader reports which attributes, class tokens, custom properties and text a paint owns, read from the element's own attributes.

### Changed
- License: relicensed to MIT-0 (MIT No Attribution). Same rights, attribution no longer required. Covers everything in the repo, including src/control-serialize.js and its vendored copies downstream.
- `Sap.why` and `Sap.doctor` now ship only in the full build. The core build warns when you call them.
- The `E01` foreign-dialect check and its dictionary now ship only in the full build.
- The core build is smaller: 44,579 to 40,585 bytes minified, 15,864 to 14,488 gzipped.
- The core build keeps every correctness check.

### Fixed
- `attr:value`, `attr:checked` and `attr:selected` are owned unless a bind, a persist or a bound select owns that form state.
- Every host repaint mounts roots a merge added.
- The classic core bundle uses its own global, so it no longer replaces `window.Sap`.
- A halted app runs no passes.
- Full-only markup that arrives after mount halts the core app before it writes anything.

## [0.2.3] - 2026-08-14

### Added
- sapjs dependency updated



## [0.2.2] - 2026-08-12

### Added
- Support for reading platform capabilities from either the `clay` or `hyperclay` namespace
- `kind`, `status`, and `url` declarations in the `hyper` key


