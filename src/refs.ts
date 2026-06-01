import type { ObjectRef, Resource, Scope, Subject } from "./types.ts"

export const subject = <const Type extends string, const Id extends string>(type: Type, id: Id): Subject<Type, Id> => ({
  type,
  id
})

export const scope = <const Type extends string, const Id extends string>(type: Type, id: Id): Scope<Type, Id> => ({
  type,
  id
})

export const resource = <const Type extends string, const Id extends string>(
  type: Type,
  id: Id,
  options?: { readonly scopes?: readonly Scope[] }
): Resource<Type, Id> => ({
  type,
  id,
  scopes: options?.scopes ?? []
})

export const sameRef = (left: ObjectRef, right: ObjectRef): boolean =>
  left.type === right.type && left.id === right.id

export const resourceScope = (resource: Resource): Scope => ({
  type: resource.type,
  id: resource.id
})

export const effectiveScopes = (resource: Resource): readonly Scope[] => [
  resourceScope(resource),
  ...resource.scopes
]
