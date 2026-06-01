# Policies

A policy is an executable authorization rule.

In `effect-access`, a policy is an Effect that:

- succeeds with `void` when access is allowed;
- fails with `Forbidden` when access is denied;
- may require Effect services.

## Permission policies

`Access.permission(...)` creates a policy from a typed permission check.

```ts
const canDeleteByRole = Access.permission("file:delete", file)
```

You can run it directly:

```ts
yield* Access.permission("file:delete", file)
```

or guard an existing Effect:

```ts
const deleteFile = (file: File) =>
  FileRepo.delete(file.id).pipe(
    Access.guard(Access.permission("file:delete", file))
  )
```

## Custom policies

Use `Access.makePolicy` for rules that are not just role/permission checks.

```ts
const isUnlocked = (file: File) =>
  Access.makePolicy(
    () => Effect.succeed(!file.locked),
    { message: "Locked files cannot be deleted" }
  )
```

The predicate receives the current subject:

```ts
const isHistoricalCreator = (file: File) =>
  Access.makePolicy((subject) =>
    Effect.succeed(file.createdBy === subject.id)
  )
```

Custom policies can use any other Effect service:

```ts
const hasPaidPlan = (workspace: Workspace) =>
  Access.makePolicy(() =>
    Effect.gen(function* () {
      const billing = yield* BillingService
      const plan = yield* billing.getPlan(workspace.id)
      return plan !== "free"
    })
  )
```

## Composing policies

Use `Access.all` for AND:

```ts
const canDeleteFile = (file: File) =>
  Access.all(
    Access.permission("file:delete", file),
    isUnlocked(file)
  )
```

Use `Access.any` for OR:

```ts
const canEditFile = (file: File) =>
  Access.any(
    Access.permission("file:write", file),
    isHistoricalCreator(file)
  )
```

## Backend enforcement

```ts
const deleteFile = (file: File) =>
  Effect.gen(function* () {
    yield* canDeleteFile(file)
    return yield* FileRepo.delete(file.id)
  })
```

or:

```ts
const deleteFile = (file: File) =>
  FileRepo.delete(file.id).pipe(
    Access.guard(canDeleteFile(file))
  )
```

## Frontend/UI booleans

Use `Access.toBool` to turn `Forbidden` into `false` while keeping other errors as errors.

```ts
const canDelete = yield* canDeleteFile(file).pipe(Access.toBool)
```

This is useful for loaders or frontend state:

```ts
const filesWithMeta = yield* Effect.forEach(files, (file) =>
  Effect.gen(function* () {
    const canDelete = yield* canDeleteFile(file).pipe(Access.toBool)
    const canShare = yield* Access.permission("file:share", file).pipe(Access.toBool)

    return { ...file, meta: { canDelete, canShare } }
  })
)
```

## Roles vs policies

Roles are durable relationships:

```txt
alice has fileOwner at file:f1
bob has workspaceAdmin at workspace:w1
```

Policies are executable rules:

```txt
canDeleteFile(file) = has file:delete AND file is not locked
```

Use roles for access that should be stored and managed. Use policies to express complete business rules.
