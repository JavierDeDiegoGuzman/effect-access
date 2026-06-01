# RoleStore and datastore integration

The only service required by `effect-access` for authorization is `Access.RoleStore`.

It answers one question:

```txt
Given a subject and a list of scopes, which roles does that subject have in those scopes?
```

## The contract

```ts
import type { RoleStoreImplementation } from "effect-access"

const RoleStoreLive: RoleStoreImplementation<typeof Access> = {
  getRoles: ({ subject, scopes }) =>
    // Effect<readonly AccessRole[]>
}
```

`RoleStoreImplementation<typeof Access>` infers:

- the allowed role names from `Access.roles`;
- the allowed scope types from `Access.permissions`.

So returning an unknown role is a type error when the value is known statically, and a schema error when loaded from unknown data and decoded.

## Recommended database shape

The library does not require this exact table, but this is the recommended model:

```sql
create table role_assignments (
  subject_type text not null,
  subject_id text not null,
  role text not null,
  scope_type text not null,
  scope_id text not null,
  created_at timestamp not null default current_timestamp,
  unique (subject_type, subject_id, role, scope_type, scope_id)
);
```

Example rows:

```txt
subject_type | subject_id | role           | scope_type | scope_id
user         | alice      | fileOwner      | file       | f1
user         | bob        | workspaceAdmin | workspace  | w1
user         | charlie    | fileEditor     | file       | f1
```

## Querying roles

When checking:

```ts
yield* Access.permission("file:delete", file)
```

and `file` maps to:

```ts
resource("file", file.id, {
  scopes: [scope("workspace", file.workspaceId)]
})
```

`RoleStore.getRoles` receives:

```ts
{
  subject: { type: "user", id: "alice" },
  scopes: [
    { type: "file", id: "f1" },
    { type: "workspace", id: "w1" }
  ]
}
```

Your query should return roles assigned to that subject in any of those scopes.

## Example implementation

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

## Providing the service

```ts
program.pipe(
  Effect.provide([
    Layer.succeed(Access.CurrentSubject, user),
    Layer.succeed(Access.RoleStore, RoleStoreLive)
  ])
)
```

## Writing assignments

`effect-access` intentionally does not own writes. Create/revoke roles in your app using your datastore.

When a file is created:

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

When a file is shared with an editor:

```ts
yield* RoleAssignmentRepo.insert({
  subjectType: "user",
  subjectId: editorUserId,
  role: "fileEditor",
  scopeType: "file",
  scopeId: file.id
})
```

When a user becomes workspace admin:

```ts
yield* RoleAssignmentRepo.insert({
  subjectType: "user",
  subjectId: userId,
  role: "workspaceAdmin",
  scopeType: "workspace",
  scopeId: workspace.id
})
```
