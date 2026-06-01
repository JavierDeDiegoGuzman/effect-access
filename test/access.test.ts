import { describe, expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { defineAccess, Forbidden, resource, scope, type RoleStoreImplementation } from "../src/index.ts"

const Access = defineAccess({
  permissions: {
    app: ["admin"],
    workspace: ["manage"],
    file: ["read", "write", "delete"]
  },
  roles: {
    appAdmin: ["app:admin"],
    workspaceAdmin: ["workspace:manage", "file:read", "file:write", "file:delete"],
    fileReader: ["file:read"],
    fileWriter: ["file:write"]
  }
} as const)

const user = Access.subject("user", "u1")
const workspace = Access.scope("workspace", "w1")
const file = Access.resource("file", "f1", { scopes: [workspace] })

type WorkspaceEntity = {
  readonly kind: "workspace"
  readonly id: string
}

type FileEntity = {
  readonly kind: "file"
  readonly id: string
  readonly workspaceId: string
}

const AccessWithResources = defineAccess({
  permissions: {
    workspace: ["manage"],
    file: ["read", "write", "delete"]
  },
  roles: {
    workspaceAdmin: ["workspace:manage", "file:read", "file:write", "file:delete"],
    fileEditor: ["file:read", "file:write"]
  },
  resources: {
    workspace: (workspace: WorkspaceEntity) => resource("workspace", workspace.id),
    file: (file: FileEntity) =>
      resource("file", file.id, {
        scopes: [scope("workspace", file.workspaceId)]
      })
  }
} as const)

describe("effect-access v2", () => {
  test("authorizes permissions from roles assigned to ancestor scopes", async () => {
    const roleStore = Access.makeRoleStore([
      Access.roleBinding({ subject: user, scope: workspace, role: "workspaceAdmin" })
    ])

    const result = await Effect.runPromise(
      Effect.succeed("read").pipe(
        Access.require("file:read", file),
        Effect.provide([
          Layer.succeed(Access.CurrentSubject, user),
          Layer.succeed(Access.RoleStore, roleStore)
        ])
      )
    )

    expect(result).toBe("read")
  })

  test("denies missing permissions", async () => {
    const roleStore = Access.makeRoleStore([
      Access.roleBinding({ subject: user, scope: Access.scope("file", "f1"), role: "fileReader" })
    ])

    await expect(
      Effect.runPromise(
        Effect.succeed("write").pipe(
          Access.require("file:write", file),
          Effect.provide([
            Layer.succeed(Access.CurrentSubject, user),
            Layer.succeed(Access.RoleStore, roleStore)
          ])
        )
      )
    ).rejects.toBeInstanceOf(Forbidden)
  })

  test("can returns booleans and toBool only catches Forbidden", async () => {
    const roleStore = Access.makeRoleStore([
      Access.roleBinding({ subject: user, scope: Access.scope("file", "f1"), role: "fileReader" })
    ])

    const canRead = await Effect.runPromise(
      Access.can("file:read", file).pipe(
        Effect.provide([
          Layer.succeed(Access.CurrentSubject, user),
          Layer.succeed(Access.RoleStore, roleStore)
        ])
      )
    )

    const canWrite = await Effect.runPromise(
      Access.policy("file:write", file).pipe(
        Access.toBool,
        Effect.provide([
          Layer.succeed(Access.CurrentSubject, user),
          Layer.succeed(Access.RoleStore, roleStore)
        ])
      )
    )

    expect(canRead).toBe(true)
    expect(canWrite).toBe(false)
  })

  test("supports project-provided role stores", async () => {
    const store: RoleStoreImplementation<typeof Access> = {
      getRoles: ({ subject, scopes }) =>
        Effect.succeed(
          subject.id === "u1" && scopes.some((scope) => scope.type === "workspace" && scope.id === "w1")
            ? ["fileWriter"]
            : []
        )
    }

    const result = await Effect.runPromise(
      Effect.succeed("write").pipe(
        Access.require("file:write", file),
        Effect.provide([
          Layer.succeed(Access.CurrentSubject, user),
          Layer.succeed(Access.RoleStore, store)
        ])
      )
    )

    expect(result).toBe("write")
  })

  test("resource mappings type permission inputs by permission resource", async () => {
    const mappedUser = AccessWithResources.subject("user", "u1")
    const workspaceEntity: WorkspaceEntity = { kind: "workspace", id: "w1" }
    const fileEntity: FileEntity = { kind: "file", id: "f1", workspaceId: workspaceEntity.id }
    const roleStore = AccessWithResources.makeRoleStore([
      AccessWithResources.roleBinding({
        subject: mappedUser,
        scope: AccessWithResources.scope("workspace", workspaceEntity.id),
        role: "workspaceAdmin"
      })
    ])

    const result = await Effect.runPromise(
      Effect.succeed("delete").pipe(
        AccessWithResources.require("file:delete", fileEntity),
        Effect.provide([
          Layer.succeed(AccessWithResources.CurrentSubject, mappedUser),
          Layer.succeed(AccessWithResources.RoleStore, roleStore)
        ])
      )
    )

    expect(result).toBe("delete")

    AccessWithResources.permission("workspace:manage", workspaceEntity)
    AccessWithResources.permission("file:delete", fileEntity)
    // @ts-expect-error workspace input is not accepted for file permissions
    AccessWithResources.permission("file:delete", workspaceEntity)
    // @ts-expect-error file input is not accepted for workspace permissions
    AccessWithResources.permission("workspace:manage", fileEntity)
  })

  test("schemas validate rows loaded from a datastore", async () => {
    const rows: unknown = [
      {
        subjectType: "user",
        subjectId: "u1",
        scopeType: "workspace",
        scopeId: "w1",
        role: "workspaceAdmin"
      }
    ]

    const decoded = await Effect.runPromise(
      Schema.decodeUnknownEffect(Schema.Array(Access.schemas.RoleAssignmentRow))(rows)
    )

    const bindings = decoded.map((row) =>
      Access.roleBinding({
        subject: Access.subject(row.subjectType, row.subjectId),
        scope: Access.scope(row.scopeType, row.scopeId),
        role: row.role
      })
    )

    const result = await Effect.runPromise(
      Effect.succeed("delete").pipe(
        Access.require("file:delete", file),
        Effect.provide([
          Layer.succeed(Access.CurrentSubject, user),
          Layer.succeed(Access.RoleStore, Access.makeRoleStore(bindings))
        ])
      )
    )

    expect(result).toBe("delete")
  })

  test("schemas reject unknown roles from a datastore", async () => {
    await expect(
      Effect.runPromise(
        Schema.decodeUnknownEffect(Schema.Array(Access.schemas.RoleAssignmentRow))([
          {
            subjectType: "user",
            subjectId: "u1",
            scopeType: "workspace",
            scopeId: "w1",
            role: "owner"
          }
        ])
      )
    ).rejects.toBeDefined()
  })
})
