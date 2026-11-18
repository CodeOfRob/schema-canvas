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
      "fields": [
        {
          "name": "displayName",
          "type": "String",
          "nullable": false,
          "list": false, "pk": false, "uk": false, "fk": false,   // optional flags, false = omitted
          "default": "now()",                                      // optional, source text
          "note": "free text",
          "origin": ["Customer.fullName"]                          // target only
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
  "indexes": [{ "entity": "Order", "name": "optional", "fields": ["accountId", "placedAt"], "unique": false, "where": "optional predicate" }],
  "enums": [{ "name": "OrderStatus", "values": ["OPEN", "PAID"] }]
}
```

## Relations

- `from` is the **referencing** side (the table that holds the foreign key), `to` the referenced side.
  `fromFields` are the foreign-key columns on `from`, `toFields` the referenced columns on `to`.
- `cardinality.from` / `cardinality.to` say how many rows sit on each end: `"1"`, `"0..1"` or `"n"`.
  `Order -> Account` with `{ from: "n", to: "1" }` reads "many orders per account".
- `label` defaults to the foreign-key field names.

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

- A changed type, list flag, nullability, key flag or default marks a field as *changed*.
- Current parts that no target part claims are *removed*.
- Relations are compared by endpoints and foreign-key fields after mapping current names to their
  successors; a different cardinality marks a relation as *changed*.
- Entity names may contain dots (`audit.events`); field references split at the **last** dot.
- References that point to nothing in the current model are reported as warnings by `build`.
