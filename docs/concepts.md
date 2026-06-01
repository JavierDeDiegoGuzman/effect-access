# Concepts

`effect-access` separates authorization into a few small concepts.

## Permissions

Permissions are atomic capabilities:

```ts
"file:read"
"file:write"
"file:delete"
"workspace:manage"
```

They are defined in code:

```ts
const Access = defineAccess({
  permissions: {
    workspace: ["manage"],
    file: ["read", "write", "delete"]
  },
  roles: {
    workspaceAdmin: ["workspace:manage", "file:read", "file:write", "file:delete"]
  }
} as const)
```

Application code should check permissions, not roles:

```ts
yield* Access.permission("file:delete", file)
```

## Roles

Roles are named bundles of permissions:

```ts
roles: {
  workspaceAdmin: ["workspace:manage", "file:read", "file:write", "file:delete"],
  fileOwner: ["file:read", "file:write", "file:delete"],
  fileEditor: ["file:read", "file:write"],
  fileReader: ["file:read"]
}
```

Roles are useful for humans and persistence. They answer questions like:

```txt
Who owns this file?
Who can edit this file?
Who is an admin of this workspace?
```

But business code should still ask:

```txt
Can the current subject perform file:delete on this file?
```

## Role assignments

A role assignment says:

```txt
subject has role at scope
```

Example rows:

```txt
user:alice has fileOwner at file:f1
user:bob has workspaceAdmin at workspace:w1
```

A role only applies when its scope is one of the effective scopes for the resource being checked.

## Scopes and resources

A scope is a place where a role can be assigned:

```ts
Access.scope("workspace", "w1")
Access.scope("file", "f1")
```

A resource is the thing being authorized:

```ts
resource("file", file.id, {
  scopes: [scope("workspace", file.workspaceId)]
})
```

For a file inside a workspace, the effective scopes are:

```txt
file:f1
workspace:w1
```

So these assignments apply:

```txt
fileOwner @ file:f1
workspaceAdmin @ workspace:w1
```

But this does not:

```txt
workspaceAdmin @ workspace:w2
```

## Resource mappings

Resource mappings convert domain objects into authorization resources.

```ts
resources: {
  file: (file: File) =>
    resource("file", file.id, {
      scopes: [scope("workspace", file.workspaceId)]
    })
}
```

This lets you write:

```ts
Access.permission("file:delete", file)
```

instead of manually building the resource every time.

It also gives type safety:

```ts
Access.permission("file:delete", file)       // ok
Access.permission("file:delete", workspace)  // type error
```

## Policies

A policy is an Effect that succeeds when access is allowed and fails with `Forbidden` when denied.

`Access.permission(...)` is a policy primitive:

```ts
Access.permission("file:delete", file)
```

You can compose it with custom rules:

```ts
Access.all(
  Access.permission("file:delete", file),
  isUnlocked(file)
)
```

Use policies for complete business rules. Use roles as persisted access relationships.
