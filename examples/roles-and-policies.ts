import { Effect, Layer } from "effect"
import { defineAccess, resource, scope, type RoleStoreImplementation } from "../src/index.ts"

type Workspace = {
  readonly kind: "workspace"
  readonly id: string
}

type File = {
  readonly kind: "file"
  readonly id: string
  readonly workspaceId: string
  readonly createdBy: string
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

const alice = Access.subject("user", "alice")
const bob = Access.subject("user", "bob")
const workspace: Workspace = { kind: "workspace", id: "w1" }

const createdFile: File = {
  kind: "file",
  id: "f1",
  workspaceId: workspace.id,
  createdBy: alice.id,
  locked: false
}

// When Alice creates the file, the app persists a scoped role assignment.
const roleAssignments = [
  Access.roleBinding({
    subject: alice,
    role: "fileOwner",
    scope: Access.scope("file", createdFile.id)
  }),
  Access.roleBinding({
    subject: bob,
    role: "workspaceAdmin",
    scope: Access.scope("workspace", workspace.id)
  })
]

const RoleStoreLive: RoleStoreImplementation<typeof Access> = Access.makeRoleStore(roleAssignments)

const isUnlocked = (file: File) =>
  Access.makePolicy(
    () => Effect.succeed(!file.locked),
    { message: "Locked files cannot be deleted" }
  )

const FilePolicy = {
  canRead: (file: File) => Access.permission("file:read", file),
  canDelete: (file: File) =>
    Access.all(
      Access.permission("file:delete", file),
      isUnlocked(file)
    )
}

const deleteFile = (file: File) =>
  Effect.succeed(`deleted ${file.id}`).pipe(
    Access.guard(FilePolicy.canDelete(file))
  )

const deletedByOwner = await Effect.runPromise(
  deleteFile(createdFile).pipe(
    Effect.provide([
      Layer.succeed(Access.CurrentSubject, alice),
      Layer.succeed(Access.RoleStore, RoleStoreLive)
    ])
  )
)

const adminCanRead = await Effect.runPromise(
  FilePolicy.canRead(createdFile).pipe(
    Access.toBool,
    Effect.provide([
      Layer.succeed(Access.CurrentSubject, bob),
      Layer.succeed(Access.RoleStore, RoleStoreLive)
    ])
  )
)

console.log({ deletedByOwner, adminCanRead })
