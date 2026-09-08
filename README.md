# n8n-nodes-unopim

n8n community nodes for [UnoPim](https://unopim.com), the open-source Product
Information Management system.

Two nodes ship in this package:

| Node | What it does |
|---|---|
| **UnoPim** | Reads and writes the catalog — products, categories, attributes, families and settings |
| **UnoPim Trigger** | Starts a workflow the moment the catalog changes |

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Trigger events](#trigger-events) · [Compatibility](#compatibility)

## Installation

Follow the
[community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
and install `n8n-nodes-unopim`.

The trigger node also needs the UnoPim side of the connector installed on your
PIM. See [the connector package](https://github.com/unopim/unopim-n8n) for that
half. The action node works against a stock UnoPim install with no extra
package.

## Credentials

UnoPim authenticates with Passport's password grant.

1. In UnoPim, open **Configuration → Integrations → API Keys** and create a key.
2. Copy four values from that row: Client ID, Client Secret, API Username and
   API Password.
3. In n8n, create a **UnoPim API** credential and paste them, along with your
   UnoPim URL.

> The **Username** is the value UnoPim generated, in the form
> `integration+<id>@api.local`. It is not your own admin login. An admin login
> is accepted by the form but fails every request afterwards.

## Operations

The UnoPim node covers eleven resources. Every resource supports **Get Many**,
**Get**, **Create**, **Update** and **Delete**; most also support
**Update Partially**, which sends a PATCH rather than replacing the record.

| Resource | Endpoint |
|---|---|
| Product | `/products` |
| Configurable Product | `/configurable-products` |
| Category | `/categories` |
| Attribute | `/attributes` |
| Attribute Group | `/attribute-groups` |
| Attribute Family | `/families` |
| Category Field | `/category-fields` |
| Association Type | `/association-types` |
| Locale | `/locales` |
| Channel | `/channels` |
| Currency | `/currencies` |

**Get Many** takes a **Return All** toggle. UnoPim caps a page at 100 rows, so
returning everything walks the pages for you — using keyset pagination, which
stays fast on a large catalog where page offsets do not.

You can narrow a listing with UnoPim's own filter syntax:

```json
{ "sku": [{ "operator": "IN", "value": ["SHIRT-01", "SHIRT-02"] }] }
```

Dropdowns for locales, channels, families, attributes and categories are loaded
live from the connected instance, so they always match what that PIM actually
has.

### Use with an AI agent

The UnoPim node is available as a tool, so an AI Agent node can query and update
the catalog directly — "find every product missing a description in French and
fill it in" becomes one agent step rather than a hand-built branch.

## Trigger events

The trigger registers a webhook with UnoPim when the workflow is activated and
removes it when the workflow is switched off. Nothing polls.

| Entity | Events |
|---|---|
| Product | created · updated · deleted |
| Category | created · updated · deleted |
| Attribute | created · updated · deleted |
| Attribute Family | created · updated · deleted |

Five wildcards cover the case where a workflow cares that *something* changed
rather than exactly what: `product.any`, `category.any`, `attribute.any`,
`family.any` and `catalog.any`. Every payload carries `entity` and `reference`,
so a workflow listening on `catalog.any` can tell a product from a family.

### Options

- **Locale** and **Channel** narrow the delivered values to one scope.
- **Flatten Values** collapses the attribute value scopes onto one level
  (`price__default__en_US`). It is off by default — n8n reads nested JSON
  natively, and the nested shape is easier to walk in an expression.
- **Signing Secret** makes UnoPim sign each delivery. A delivery whose
  signature does not match is rejected.

### Notes

- UnoPim writes a product row and then saves its values, so creating a product
  through the API fires both `product.created` and `product.updated`. A
  workflow with both triggers enabled runs twice for one new product.
- The UnoPim side delivers on a dedicated queue. Without a queue worker running
  on that queue, no trigger ever fires.
- If your n8n instance is not reachable from UnoPim, deliveries fail and the
  subscription is deactivated after several consecutive failures. It
  reactivates by itself the next time the workflow is switched on.

## Compatibility

- n8n 1.x and 2.x, tested on 2.36.7
- Node.js 22 or newer
- UnoPim 3.0 or newer

## Changelog

Release history is in [CHANGELOG.md](CHANGELOG.md).

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [UnoPim documentation](https://docs.unopim.com/)

## License

[MIT](LICENSE)
