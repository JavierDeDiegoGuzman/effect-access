# effect-access

Minimal, Effect-native authorization for apps with scoped roles.

`effect-access` helps you define permissions and roles in code, store only role assignments in your datastore, and check authorization with composable Effect policies.

```ts
yield* Access.permission("file:delete", file)
```

That single check is:

- type-safe: `"file:delete"` must be a known permission;
- resource-safe: the second argument must be a `file` domain object;
- scoped: roles assigned on `file:f1` or its parent scopes like `workspace:w1` can apply;
- composable: it is a normal Effect policy.

## Install

```bash
bun add effect-access effect
```

## Quick start

```ts
import { Effect, Layer } from "effect"
import { defineAccess, resource, scope, type RoleStoreImplementation } from "effect-access"

type Workspace = {
  readonly kind: "workspace"
  readonly id: string
}

type File = {
  readonly kind: "file"
  readonly id: string
  readonly workspaceId: string
  readonly locked: boolean
}

const Access = defineAccess({
  permissions: {
    workspace: ["manage"],
    file: ["read", "write", "delete", "share"]
  },
  roles: {
    workspaceAdmin: ["workspace:manage", "file:read", "file:write", "file:delete", "file:share"],
    fileOwner: ["file:read", "file:write", "file:delete", "file:share"],
    fileEditor: ["file:read", "file:write"],
    fileReader: ["file:read"]
  },
  resources: {
    workspace: (workspace: Workspace) => resource("workspace", workspace.id),
    file: (file: File) =>
      resource("file", file.id, {
        scopes: [scope("workspace", file.workspaceId)]
      })
  }
} as const)
```

Create a `RoleStore`. This is the only service required for authorization.

```ts
const RoleStoreLive: RoleStoreImplementation<typeof Access> = {
  getRoles: ({ subject, scopes }) =>
    Effect.gen(function* () {
      // Query your DB however you want.
      // Return roles assigned to `subject` in any of the requested `scopes`.
      return ["workspaceAdmin"]
    })
}
```

Use permissions in application code:

```ts
const user = Access.subject("user", "u1")
const file: File = { kind: "file", id: "f1", workspaceId: "w1", locked: false }

const program = Effect.gen(function* () {
  yield* Access.permission("file:delete", file)
  return "deleted"
})

const result = await Effect.runPromise(
  program.pipe(
    Effect.provide([
      Layer.succeed(Access.CurrentSubject, user),
      Layer.succeed(Access.RoleStore, RoleStoreLive)
    ])
  )
)
```

## Core model

| Concept | Meaning | Lives in |
| --- | --- | --- |
| Permission | Atomic capability, e.g. `file:delete` | Code |
| Role | Named bundle of permissions, e.g. `fileOwner` | Code |
| Role assignment | `subject` has `role` at `scope` | Database / datastore |
| Resource mapper | Converts domain objects to authorization resources/scopes | Code |
| RoleStore | Effect service that loads scoped roles | Your app |
| Policy | Executable authorization rule | Code |

The datastore stores roles, not permissions:

```txt
subject_type | subject_id | role           | scope_type | scope_id
user         | alice      | fileOwner      | file       | f1
user         | bob        | workspaceAdmin | workspace  | w1
```

The code checks permissions:

```ts
yield* Access.permission("file:delete", file)
```

If `file:f1` belongs to `workspace:w1`, this allows either:

```txt
fileOwner @ file:f1
workspaceAdmin @ workspace:w1
```

but not:

```txt
workspaceAdmin @ workspace:w2
```

## Resource mappings

Resource mappings are what make scoped authorization ergonomic and type-safe.

```ts
resources: {
  file: (file: File) =>
    resource("file", file.id, {
      scopes: [scope("workspace", file.workspaceId)]
    })
}
```

Now the permission prefix controls the input type:

```ts
Access.permission("file:delete", file)       // ok
Access.permission("workspace:manage", ws)   // ok
Access.permission("file:delete", ws)         // type error
```

## Policies

`Access.permission(...)` is already a policy:

```ts
const canDeleteByRole = Access.permission("file:delete", file)
```

You can compose it with custom policies:

```ts
const isUnlocked = (file: File) =>
  Access.makePolicy(
    () => Effect.succeed(!file.locked),
    { message: "Locked files cannot be deleted" }
  )

const canDeleteFile = (file: File) =>
  Access.all(
    Access.permission("file:delete", file),
    isUnlocked(file)
  )
```

Use a policy as a guard:

```ts
const deleteFile = (file: File) =>
  Effect.succeed("deleted").pipe(
    Access.guard(canDeleteFile(file))
  )
```

Or convert it to a boolean for UI decisions:

```ts
const canDelete = yield* canDeleteFile(file).pipe(Access.toBool)
```

## RoleStore with database rows

Recommended table shape:

```sql
create table role_assignments (
  subject_type text not null,
  subject_id text not null,
  role text not null,
  scope_type text not null,
  scope_id text not null,
  unique (subject_type, subject_id, role, scope_type, scope_id)
);
```

Implementation sketch:

```ts
import { Effect, Schema } from "effect"
import type { RoleStoreImplementation } from "effect-access"

const RoleStoreLive: RoleStoreImplementation<typeof Access, DbError> = {
  getRoles: ({ subject, scopes }) =>
    Effect.gen(function* () {
      const rows = yield* db.roleAssignments.findMany({
        where: {
          subjectType: subject.type,
          subjectId: subject.id,
          OR: scopes.map((scope) => ({
            scopeType: scope.type,
            scopeId: scope.id
          }))
        }
      })

      const decoded = yield* Schema.decodeUnknownEffect(
        Schema.Array(Access.schemas.RoleAssignmentRow)
      )(rows)

      return decoded.map((row) => row.role)
    })
}
```

`Access.schemas.RoleAssignmentRow` validates that roles and scope types loaded from the datastore exist in your access definition.

## Creating files / assigning roles

`effect-access` does not write roles to your database. Your app owns that.

When a user creates a file, insert your domain row and then insert a role assignment:

```ts
const createFile = (input: CreateFileInput) =>
  Effect.gen(function* () {
    const subject = yield* Access.CurrentSubject

    const file = yield* FileRepo.create(input)

    yield* RoleAssignmentRepo.insert({
      subjectType: subject.type,
      subjectId: subject.id,
      role: "fileOwner",
      scopeType: "file",
      scopeId: file.id
    })

    return file
  })
```

After that, this works automatically:

```ts
yield* Access.permission("file:delete", file)
```

## More docs

- [Concepts](./docs/concepts.md)
- [RoleStore and datastore integration](./docs/role-store.md)
- [Policies](./docs/policies.md)
- [API reference](./docs/api.md)

## Examples

- [`examples/basic.ts`](./examples/basic.ts)
- [`examples/role-store-with-schema.ts`](./examples/role-store-with-schema.ts)
- [`examples/roles-and-policies.ts`](./examples/roles-and-policies.ts)
