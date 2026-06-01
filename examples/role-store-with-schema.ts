import { Effect, Layer, Schema } from "effect"
import { defineAccess, type RoleStoreImplementation } from "../src/index.ts"

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

// Simulates rows returned by a database. Treat them as unknown until Schema validates them.
const roleAssignmentRows: unknown = [
  {
    subjectType: "user",
    subjectId: "u1",
    scopeType: "workspace",
    scopeId: "w1",
    role: "workspaceAdmin"
  }
]

const RoleStoreLive: RoleStoreImplementation<typeof Access, unknown> = {
  getRoles: ({ subject, scopes }) =>
    Effect.gen(function* () {
      const rows = yield* Schema.decodeUnknownEffect(
        Schema.Array(Access.schemas.RoleAssignmentRow)
      )(roleAssignmentRows)

      return rows
        .filter(
          (row) =>
            row.subjectType === subject.type &&
            row.subjectId === subject.id &&
            scopes.some((scope) => scope.type === row.scopeType && scope.id === row.scopeId)
        )
        .map((row) => row.role)
    })
}

const user = Access.subject("user", "u1")
const file = Access.resource("file", "f1", {
  scopes: [Access.scope("workspace", "w1")]
})

const result = await Effect.runPromise(
  Effect.succeed("file content").pipe(
    Access.require("file:read", file),
    Effect.provide([
      Layer.succeed(Access.CurrentSubject, user),
      Layer.succeed(Access.RoleStore, RoleStoreLive)
    ])
  )
)

console.log(result)
