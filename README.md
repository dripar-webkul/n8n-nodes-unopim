# n8n-nodes-unopim

n8n community nodes for [UnoPim](https://unopim.com) — connect an UnoPim PIM catalog to n8n workflows.

> Status: repository scaffold. No node code has been written yet. This README collects everything needed to build, test, publish and submit the package.

- npm package: `@unopim/n8n-nodes-unopim`
- Repository: `github.com/unopim/n8n-nodes-unopim`
- License: MIT

## Planned package contents

| Node | Type | Purpose |
| --- | --- | --- |
| UnoPim | Action | CRUD over the full UnoPim REST v1 surface |
| UnoPim Trigger | Trigger (webhook) | Receives events from the UnoPim Webhook package |
| UnoPim API | Credential | OAuth 2.0 password grant against UnoPim Passport |

## Authentication

UnoPim exposes Laravel Passport with the **password grant**. An API key is created in the admin panel (Settings → API Keys), which yields `client_id` and `client_secret`; the admin user's `username`/`password` complete the grant.

```
POST {baseUrl}/oauth/token
{
  "grant_type":    "password",
  "client_id":     "...",
  "client_secret": "...",
  "username":      "...",
  "password":      "...",
  "scope":         ""
}
```

The response carries `access_token`, `refresh_token` and `expires_in`. `refresh_token` grant is also supported, so the credential should refresh rather than re-issue on expiry.

Every request then needs:

```
Authorization: Bearer {access_token}
Accept: application/json
```

Per-route authorization is enforced by `ScopeMiddleware` against the API key's permissions (`permission_type: all`, or an explicit ACL list). A key without the matching permission returns `403 {"error":"This action is unauthorized"}`.

Requests are rate limited (`throttle:rest-api`) and the token endpoint has its own throttle. Responses are `cache.headers:private;etag`, and a locale can be selected per request (`request.locale`).

## REST API surface (`{baseUrl}/api/v1/rest/...`)

### Catalog

| Resource | Path | Operations |
| --- | --- | --- |
| Products (simple) | `products` | list, get `{code}`, create, update `{code}` (PUT), patch `{sku}`, delete `{code}` |
| Configurable products | `configurable-products` | list, get, create, update, patch, delete |
| Categories | `categories` | list, get `{code}`, create, update, patch, delete |
| Category fields | `category-fields` | list, get, create, update, patch, delete + options: get / create / update / delete `{optionCode}` |
| Attributes | `attributes` | list, get `{code}`, create, update, patch, delete + options: get / create / update / delete `{optionCode}` |
| Attribute groups | `attribute-groups` | list, get, create, update, patch, delete |
| Attribute families | `families` | list, get, create, update, patch, delete |
| Variant structures | `families/{code}/variant-structures` | list, get `{structureCode}`, create, update, patch, delete |
| Association types | `association-types` | list, get, create, update, patch, delete + fields: get / create / update `{fieldCode}` / delete `{fieldCode}` |
| Media files | `media-files/product`, `media-files/category`, `media-files/swatch` | upload (POST), get, delete |
| Product passports | `passports` | list, get `{sku}`, publish `{sku}`, withdraw `{id}`, reinstate `{id}`, redact `{id}` |

`configrable-products` (legacy typo) is still routed but marked deprecated — nodes must use `configurable-products`.

### Settings

| Resource | Path | Operations |
| --- | --- | --- |
| Locales | `locales` | list, get, create, update, delete |
| Channels | `channels` | list, get, create, update, delete |
| Currencies | `currencies` | list, get, create, update, delete |

Most resources key on a string `code`; products additionally accept `sku` on PATCH.

## Trigger node

UnoPim ships a first-party Webhook package (admin → Configuration → Webhook) with per-event endpoints, retry handling and delivery logs. There is no REST endpoint for managing webhooks, so the trigger node registers a manual webhook URL that the user pastes into the UnoPim admin. Delivery logs in the admin are the debugging surface.

## Reference material

Build:
- Create nodes index — https://docs.n8n.io/connect/create-nodes/
- n8n-node CLI tool — https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool
- Starter repository — https://github.com/n8n-io/n8n-nodes-starter
- Verification guidelines — https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines

Test:
- Run your node locally — https://docs.n8n.io/connect/create-nodes/test-your-node/run-your-node-locally

Deploy:
- Submit community nodes — https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes
- Creator Portal, submit a node — https://creators.n8n.io/nodes
- npm provenance — https://docs.npmjs.com/generating-provenance-statements
- Installing community nodes — https://docs.n8n.io/integrations/community-nodes/installation/

Templates:
- Creator hub, submit templates — https://n8n.io/creators/
- Workflow templates — https://docs.n8n.io/workflows/templates/

Prior art to model the package on:
- https://github.com/elevenlabs/elevenlabs-n8n
- https://www.npmjs.com/package/@elevenlabs/n8n-nodes-elevenlabs

UnoPim:
- https://github.com/unopim/unopim
- https://docs.unopim.com

## Verification checklist (n8n)

- Package name matches `n8n-nodes-*` (scoped form `@unopim/n8n-nodes-unopim` is accepted).
- `n8n-nodes-community` keyword in `package.json`, plus the `n8n` block declaring credentials and nodes.
- No runtime dependencies beyond what the node genuinely needs; no `n8n-core`/`n8n-workflow` in `dependencies`.
- Nodes are declarative (`routing`-based) wherever the API allows it.
- Credential ships a `test` block so "Test connection" works in the UI.
- Lint clean under `eslint-plugin-n8n-nodes-base`, including the `community` ruleset.
- SVG icon, `codex` metadata file, MIT license, README with setup and operations.
- Published to npm with provenance from a GitHub Actions workflow.
