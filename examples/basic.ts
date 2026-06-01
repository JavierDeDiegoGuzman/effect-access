import { Effect, Layer } from "effect"
import { defineAccess } from "../src/index.ts"

const Access = defineAccess({
  permissions: {
    workspace: ["manage"],
    file: ["read", "write", "delete"]
  },
  roles: {
    workspaceAdmin: ["workspace:manage", "file:read", "file:write", "file:delete"],
    fileReader: ["file:read"]
  }
} as const)

const user = Access.subject("user", "u1")
const workspace = Access.scope("workspace", "w1")
const file = Access.resource("file", "f1", { scopes: [workspace] })

const roleStore = Access.makeRoleStore([
  Access.roleBinding({
    subject: user,
    scope: workspace,
    role: "workspaceAdmin"
  })
])

const result = await Effect.runPromise(
  Effect.succeed("file deleted").pipe(
    Access.require("file:delete", file),
    Effect.provide([
      Layer.succeed(Access.CurrentSubject, user),
      Layer.succeed(Access.RoleStore, roleStore)
    ])
  )
)

console.log(result)
