// Current-vs-target comparison. The target model says where its parts come from via origin[]
// (entity: current entity names, field: "Entity.field" refs). Nothing is guessed from prose.
//
// Implicit origin: when a target entity or field has NO origin property at all, a same-named counterpart
// in the current model counts as its origin, so unchanged parts need no bookkeeping. An explicit
// origin (even []) always wins; [] marks a part as new despite a name match.
import { fieldRef, splitFieldRef } from "../model/normalize.js";

const COMPARED_FIELD_PROPERTIES = ["type", "list", "nullable", "pk", "uk", "fk", "default"];

// changed: true on a target field records a change the compared properties cannot show (new enum values, a new meaning).
function fieldChanged(before, after) {
  return after.changed === true || COMPARED_FIELD_PROPERTIES.some(key => before[key] !== after[key]);
}

function sortedJoin(values) {
  return [...values].sort().join(",");
}

/**
 * @returns {{
 *   target: { entities: Record<string, {status, origin: string[]}>, fields: Record<string, string>, relations: Record<string, string> },
 *   current: { entities: Record<string, {status, to: string[]}>, fields: Record<string, {status, to: string[]}>, relations: Record<string, string> },
 *   unresolvedOrigins: { where: string, ref: string }[]
 * }}
 */
export function computeDiff(current, target) {
  const currentByName = new Map(current.entities.map(e => [e.name, e]));
  const currentFieldByRef = new Map();
  for (const e of current.entities) for (const f of e.fields) currentFieldByRef.set(fieldRef(e.name, f.name), { entity: e, field: f });
  const unresolvedOrigins = [];

  // Resolved origins per target entity and field.
  const entityOrigin = new Map();
  for (const e of target.entities) {
    const declared = e.origin === undefined ? (currentByName.has(e.name) ? [e.name] : []) : e.origin;
    for (const name of declared) if (!currentByName.has(name)) unresolvedOrigins.push({ where: e.name, ref: name });
    entityOrigin.set(e.id, declared.filter(name => currentByName.has(name)));
  }
  const fieldOrigin = new Map();
  for (const e of target.entities) {
    for (const f of e.fields) {
      let declared = f.origin;
      if (declared === undefined) declared = entityOrigin.get(e.id).map(name => fieldRef(name, f.name)).filter(ref => currentFieldByRef.has(ref));
      else for (const ref of declared) if (!currentFieldByRef.has(ref)) unresolvedOrigins.push({ where: fieldRef(e.name, f.name), ref });
      fieldOrigin.set(f.id, declared.filter(ref => currentFieldByRef.has(ref)));
    }
  }

  // Which target fields claim each current field.
  const successorsOfField = new Map();
  for (const e of target.entities) for (const f of e.fields) for (const ref of fieldOrigin.get(f.id)) {
    if (!successorsOfField.has(ref)) successorsOfField.set(ref, []);
    successorsOfField.get(ref).push({ entity: e, field: f });
  }

  const targetFields = {};
  for (const e of target.entities) {
    const origins = new Set(entityOrigin.get(e.id));
    for (const f of e.fields) {
      const refs = fieldOrigin.get(f.id);
      let status;
      if (!refs.length) status = "added";
      else if (refs.some(ref => !origins.has(splitFieldRef(ref).entity))) status = "moved";
      else {
        const sameName = refs.find(ref => splitFieldRef(ref).field === f.name);
        if (!sameName) status = "renamed";
        else status = fieldChanged(currentFieldByRef.get(sameName).field, f) ? "changed" : "same";
      }
      targetFields[f.id] = status;
    }
  }

  const currentFields = {};
  for (const e of current.entities) for (const f of e.fields) {
    const successors = successorsOfField.get(fieldRef(e.name, f.name));
    if (!successors) { currentFields[f.id] = { status: "removed", to: [] }; continue; }
    const first = successors[0];
    let status;
    if (!entityOrigin.get(first.entity.id).includes(e.name)) status = "moved";
    else if (first.field.name !== f.name) status = "renamed";
    else status = targetFields[first.field.id] === "changed" ? "changed" : "same";
    currentFields[f.id] = { status, to: successors.map(s => fieldRef(s.entity.name, s.field.name)) };
  }

  const targetEntities = {};
  for (const e of target.entities) {
    const origin = entityOrigin.get(e.id);
    let status;
    if (!origin.length) status = "added";
    else if (origin.length > 1) status = "merged";
    else if (origin[0] !== e.name) status = "renamed";
    else {
      const fieldChange = e.fields.some(f => targetFields[f.id] !== "same");
      const lost = currentByName.get(origin[0]).fields.some(f => ["removed", "moved"].includes(currentFields[f.id].status));
      status = fieldChange || lost ? "changed" : "same";
    }
    targetEntities[e.id] = { status, origin };
  }

  const currentEntities = {};
  for (const e of current.entities) {
    const successors = target.entities.filter(t => entityOrigin.get(t.id).includes(e.name));
    let status;
    if (!successors.length) status = "removed";
    else if (!successors.some(s => s.name === e.name)) status = successors.some(s => entityOrigin.get(s.id).length > 1) ? "merged" : "renamed";
    else status = e.fields.some(f => currentFields[f.id].status !== "same") ? "changed" : "same";
    currentEntities[e.id] = { status, to: successors.map(s => s.name) };
  }

  // Relations: translate each current relation into target names (entity successor + field successor)
  // and compare by endpoints plus foreign-key fields; label only for relations without key fields.
  const currentNameById = new Map(current.entities.map(e => [e.id, e.name]));
  const targetNameById = new Map(target.entities.map(e => [e.id, e.name]));
  const successorEntity = name => {
    const all = target.entities.filter(t => entityOrigin.get(t.id).includes(name));
    return (all.find(t => t.name === name) || all[0] || { name }).name;
  };
  const currentKey = r => {
    const from = successorEntity(currentNameById.get(r.from)), to = successorEntity(currentNameById.get(r.to));
    const fields = r.fromFields.map(name => {
      const ref = fieldRef(currentNameById.get(r.from), name);
      const moved = (successorsOfField.get(ref) || []).find(s => s.entity.name === from);
      return moved ? moved.field.name : name;
    });
    return from + "|" + to + "|" + (fields.length ? sortedJoin(fields) : "~" + (r.label || ""));
  };
  const targetKey = r => targetNameById.get(r.from) + "|" + targetNameById.get(r.to) + "|" + (r.fromFields.length ? sortedJoin(r.fromFields) : "~" + (r.label || ""));
  const sameCardinality = (a, b) => a.cardinality.from === b.cardinality.from && a.cardinality.to === b.cardinality.to;
  // Several relations can share a key (two merged tables both referenced the same table), so keys map to lists.
  const groupByKey = (relations, keyOf) => {
    const groups = new Map();
    for (const r of relations) {
      const key = keyOf(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    return groups;
  };
  const currentByKey = groupByKey(current.relations, currentKey);
  const targetByKey = groupByKey(target.relations, targetKey);
  const statusAgainst = (r, counterparts, missing) => (!counterparts ? missing : counterparts.some(c => sameCardinality(c, r)) ? "same" : "changed");
  const targetRelations = {}, currentRelations = {};
  for (const [key, list] of targetByKey) for (const r of list) targetRelations[r.id] = statusAgainst(r, currentByKey.get(key), "added");
  for (const [key, list] of currentByKey) for (const r of list) currentRelations[r.id] = statusAgainst(r, targetByKey.get(key), "removed");

  return {
    target: { entities: targetEntities, fields: targetFields, relations: targetRelations },
    current: { entities: currentEntities, fields: currentFields, relations: currentRelations },
    unresolvedOrigins,
  };
}

/** Counts entity statuses on both sides, e.g. { target: { added: 1, same: 4 }, current: { removed: 1 } }. */
export function countStatuses(diff) {
  const count = map => Object.values(map).reduce((acc, value) => {
    const status = typeof value === "string" ? value : value.status;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  return {
    target: count(diff.target.entities),
    current: count(diff.current.entities),
    targetRelations: count(diff.target.relations),
    currentRelations: count(diff.current.relations),
  };
}
