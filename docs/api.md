# API reference

## `defineAccess`

```ts
const Access = defineAccess({
  permissions,
  roles,
  resources
} as const)
```

### `permissions`

Defines the permission vocabulary.

```ts
permissions: {
  workspace: ["manage"],
  file: ["read", "write", "delete"]
}
```

Produces permission strings like:

```txt
workspace:manage
file:read
file:write
file:delete
```

### `roles`

Defines role to permission mappings.

```ts
roles: {
  fileOwner: ["file:read", "file:write", "file:delete"],
  fileReader: ["file:read"]
}
```

Unknown permissions in roles throw during `defineAccess`.

### `resources`

Optional mapping from domain objects to authorization resources.

```ts
resources: {
  file: (file: File) =>
    resource("file", file.id, {
      scopes: [scope("workspace", file.workspaceId)]
    })
}
```

## Services

### `Access.CurrentSubject`

Effect service containing the current subject.

```ts
Layer.succeed(Access.CurrentSubject, Access.subject("user", "u1"))
```

### `Access.RoleStore`

Effect service used to load roles for authorization.

```ts
const RoleStoreLive: RoleStoreImplementation<typeof Access> = {
  getRoles: ({ subject, scopes }) => Effect.succeed([])
}

Layer.succeed(Access.RoleStore, RoleStoreLive)
```

## Refs

### `Access.subject(type, id)`

```ts
const user = Access.subject("user", "u1")
```

### `Access.scope(type, id)`

```ts
const workspace = Access.scope("workspace", "w1")
```

The scope type must be one of the resource types defined in `permissions`.

### `Access.resource(type, id, options?)`

```ts
const file = Access.resource("file", "f1", {
  scopes: [Access.scope("workspace", "w1")]
})
```

Usually you will prefer `resources` mappings and pass domain objects directly to `Access.permission`.

### `Access.effectiveScopes(resource)`

Returns the resource's own scope plus parent scopes.

```ts
Access.effectiveScopes(fileResource)
// [file:f1, workspace:w1]
```

## Role helpers

### `Access.roleBinding`

Creates a typed role assignment object.

```ts
Access.roleBinding({
  subject: user,
  role: "fileOwner",
  scope: Access.scope("file", file.id)
})
```

### `Access.makeRoleStore`

Creates an in-memory RoleStore. Useful for tests and examples.

```ts
const roleStore = Access.makeRoleStore([
  Access.roleBinding({ subject: user, role: "fileOwner", scope: Access.scope("file", "f1") })
])
```

## Authorization

### `Access.permission(permission, input)`

Creates a policy that checks a permission on a resource/domain object.

```ts
Access.permission("file:delete", file)
```

### `Access.can(permission, input)`

Returns `Effect<boolean>`.

```ts
const canDelete = yield* Access.can("file:delete", file)
```

### `Access.require(permission, input)`

Pipeable guard for an Effect.

```ts
Effect.succeed("deleted").pipe(
  Access.require("file:delete", file)
)
```

### `Access.makePolicy(predicate, options?)`

Creates a custom policy.

```ts
const isUnlocked = (file: File) =>
  Access.makePolicy(() => Effect.succeed(!file.locked))
```

### `Access.guard(policy)`

Applies a policy before running an Effect.

```ts
FileRepo.delete(file.id).pipe(
  Access.guard(canDeleteFile(file))
)
```

### `Access.all(...policies)`

AND composition.

```ts
Access.all(policyA, policyB)
```

### `Access.any(...policies)`

OR composition.

```ts
Access.any(policyA, policyB)
```

### `Access.toBool(policy)`

Turns `Forbidden` into `false` and success into `true`.

```ts
const allowed = yield* policy.pipe(Access.toBool)
```

## Schemas

Generated schemas:

```ts
Access.schemas.Role
Access.schemas.Permission
Access.schemas.ScopeType
Access.schemas.Scope
Access.schemas.RoleBinding
Access.schemas.RoleAssignmentRow
```

Common datastore usage:

```ts
const decoded = yield* Schema.decodeUnknownEffect(
  Schema.Array(Access.schemas.RoleAssignmentRow)
)(rows)
```

## Types

### `RoleStoreImplementation<typeof Access>`

Recommended way to type your RoleStore.

```ts
const RoleStoreLive: RoleStoreImplementation<typeof Access> = {
  getRoles: ({ subject, scopes }) => Effect.succeed([])
}
```

With custom errors:

```ts
const RoleStoreLive: RoleStoreImplementation<typeof Access, DbError> = {
  getRoles: ({ subject, scopes }) => db.getRoles(subject, scopes)
}
```
