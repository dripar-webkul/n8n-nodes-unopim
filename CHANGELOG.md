# Changelog

All notable changes to `n8n-nodes-unopim` are recorded here.

The version in `package.json` and the newest heading in this file must always
match. `npm run release` bumps `package.json` on its own, so the entry below it
has to be written by hand.

## Versions

| Version | Date | n8n | Node.js | UnoPim | UnoPim connector package |
|---|---|---|---|---|---|
| 1.0.2 | 2026-09-10 | 1.x and 2.x, tested on 2.36.7 | 22 or newer | 3.0 or newer | `webkul/n8n` 1.0.0 |
| 1.0.1 | 2026-09-09 | 1.x and 2.x, tested on 2.36.7 | 22 or newer | 3.0 or newer | `webkul/n8n` 1.0.0 |
| 1.0.0 | 2026-09-09 | 1.x and 2.x, tested on 2.36.7 | 22 or newer | 3.0 or newer | `webkul/n8n` 1.0.0 |

## 1.0.2 (2026-09-10)

### Fixed

- Add email to package author to meet community node verification standards.
- Wrap execution errors in `NodeApiError` in UnoPim action node.
- Log subscription deletion errors in UnoPim trigger lifecycle hook.

## 1.0.1 (2026-09-09)

### Changed

- Updated publish workflow for npm OIDC trusted publishing with provenance.

## 1.0.0 (2026-09-09)

First release. Two nodes and one credential, published as a community node
package.

### Added

- **UnoPim Trigger node.** Starts a workflow when the catalog changes. It
  registers the webhook with UnoPim when the workflow is switched on and removes
  it when the workflow is switched off, so there is nothing to set up in the
  UnoPim admin.
- **Seventeen events.** Created, updated and deleted for products, categories,
  attributes and families, plus five wildcards: one per record type and
  `catalog.any` for the whole catalog. The event list is loaded from the
  connected instance, so it always matches what that PIM publishes.
- **Trigger options.** Restrict deliveries to one locale or one channel, flatten
  the value scopes onto a single namespace, and verify an HMAC SHA256 signature
  with a shared signing secret.
- **UnoPim action node.** Eleven resources: product, configurable product,
  category, attribute, attribute group, attribute family, category field,
  association type, locale, channel and currency. Each supports get many, get,
  create, update and delete, and the first eight also support update partially.
- **Return All.** Walks every page of a listing using UnoPim keyset pagination,
  which stays fast on a large catalog where page offsets do not.
- **Filters and sorting** on every get many, using UnoPim own filter syntax, so
  a scheduled workflow can ask for only what changed since its last run.
- **Custom API Call** for any endpoint the node does not cover, with the
  credential already attached.
- **Loaded dropdowns.** Locales, channels, families, attributes and categories
  are fetched from the instance the credential points at.
- **Agent tool support.** The action node can be attached to an AI Agent node,
  so an agent can query and update the catalog directly.
- **UnoPim API credential.** Laravel Passport password grant, with a connection
  test that reports the number of events the instance publishes.
- **Item linking.** Every output item is linked back to the input item that
  produced it, so later nodes can trace an item to its source.
- **Continue On Fail support.** A failed item carries an `error` field instead
  of a record, so a workflow can branch on it.
- **53 unit tests** run with the built in Node test runner, and a GitHub Actions
  workflow that publishes to npm with provenance.

### Notes

- Access tokens are cached in the node process and refreshed shortly before they
  expire. A 401 forces one refresh and one retry.
- The credential rejects a URL that ends in `/admin`. The field takes the
  application root, for example `https://demo.unopim.com`.
- A node runs once per input item. A get many feeding a single write runs that
  write once per record returned, which is rarely what you want for a delete.
  Aggregate the list first.
- This release needs the UnoPim side of the connector, the `webkul/n8n` package,
  installed on the PIM.
