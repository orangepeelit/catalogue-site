# Orange Peel Catalogue

This repository contains the disposable public projection for the Orange Peel Catalogue.

Authority remains in OrangePeelIT Core. The public site must not become an independent authoritative portfolio inventory.

## Projection

The Catalogue generator is:

`tools/generate-catalogue.mjs`

The reusable Product tile component is:

`tools/catalogue-tile.mjs`

The current local assurance harness is:

`tools/verify-catalogue.mjs`

Catalogue projects:

- six governed portfolio identities
- governed display names
- governed public summaries
- governed demonstrability
- approved Product icon where available, otherwise the governed shared Orange Peel application-icon fallback
- traceability to Core records and transactions
- the Orange Peel Presentation System

Internal maturity, incomplete engineering notes, raw Core identifiers and host/context relationships are not normal public tile content.

Current governed source baseline:

- 305 semantic records
- 14 governed transactions
- 305 graph nodes
- 696 graph edges/reference arcs
- replay inserts 0

The Catalogue presentation uses the APEX site as its controlling Orange Peel shell: Product identity in the header, Orange Peel company identity in the footer.

Generated artefacts remain projections and can be rebuilt from governed Core.
