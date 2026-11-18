# model.json format

`model.json` is the canonical, database-independent description of a schema. Adapters produce it,
the CLI and the viewer validate it with the same code (`src/model/normalize.js`). A JSON Schema for
editors lives in [`schema/model.schema.json`](../schema/model.schema.json); add `"$schema"` to a file to
get completion. A test keeps the JSON Schema and the runtime validation in agreement.

The same format describes the **current** model (what exists) and the **target** model (what you want).
Only the target model uses `origin`.

```jsonc
{
  "version": 1,
  "name": "bookshop",
  "entities": [
    {
      "id": "Account",              // optional, defaults to name; relations and indexes refer to it
      "name": "Account",
      "kind": "sales",              // optional data kind (a key of config.dataKinds)
      "note": "free text",
      "origin": ["Customer"],       // target only
      "reviewed": true,             // optional review marker
      "fields": [
        {
          "name": "displayName",
          "type": "String",
          "nullable": false,
          "list": false, "pk": false, "uk": false, "fk": false,   // optional flags, false = omitted
          "default": "now()",                                      // optional, source text
          "note": "free text",
          "origin": ["Customer.fullName"],                         // target only
          "changed": true                                          // target only, optional
        }
      ]
    }
  ],
  "relations": [
    {
      "from": "Order", "to": "Account",
      "fromFields": ["accountId"], "toFields": ["id"],
      "cardinality": { "from": "n", "to": "1" },
      "label": "optional"
    }
  ],
  "indexes": [{ "entity": "Order", "name": "optional", "fields": ["accountId", "placedAt"], "unique": false, "where": "optional predicate", "note": "optional: why it exists" }],
  "enums": [{ "name": "OrderStatus", "values": ["OPEN", "PAID"] }]
}
```

## Relations

- `from` is the **referencing** side (the table that holds the foreign key), `to` the referenced side.
  `fromFields` are the foreign-key columns on `from`, `toFields` the referenced columns on `to`.
- `cardinality.from` / `cardinality.to` say how many rows sit on each end: `"1"`, `"0..1"` or `"n"`.
  `Order -> Account` with `{ from: "n", to: "1" }` reads "many orders per account".
- `label` defaults to the foreign-key field names.

## Indexes

- `fields` lists field names in index order. An entry that is not a plain name, such as `lower(email)` or
  `(data->>'key')`, is an expression: it is shown as written and not checked against the fields.
- `note` says why the index exists; the inspector shows it next to the index.

## Review marker

`reviewed: true` on an entity records that the table has been worked through in a review. The page shows a
checkbox in each table header of the target view and can dim the reviewed tables (toolbar button with the
count). It is part of the model, so it is saved and shared like every other edit.

## Origins (the diff)

The target model states where its parts come from. Nothing is guessed from names or notes.

| Value | Meaning |
|---|---|
| `origin` absent | The same-named counterpart in the current model is the origin (an entity, or a field of an origin entity). Unchanged parts need no bookkeeping. |
| `origin: []` | New: no counterpart exists. |
| `entity.origin: ["Customer"]` | Renamed (one differently named entity). |
| `entity.origin: ["Warehouse", "Stock"]` | Merged (two or more). |
| `field.origin: ["Customer.fullName"]` | Field reference `"Entity.field"` into the current model. A different name = renamed; a field of an entity outside `entity.origin` = moved. |

Further rules:

- A changed type, list flag, nullability, primary, unique or foreign key flag (`fk`) or default marks a field as *changed*.
- `changed: true` on a target field marks it as *changed* even when all of these are equal, for a change they
  cannot show (new enum values, a new meaning). The inspector has a checkbox for it.
- Current parts that no target part claims are *removed*.
- Relations are compared by endpoints and foreign-key fields after mapping current names to their
  successors; a different cardinality marks a relation as *changed*.
- Entity names may contain dots (`audit.events`); field references split at the **last** dot.
- References that point to nothing in the current model are reported as warnings by `build`.
