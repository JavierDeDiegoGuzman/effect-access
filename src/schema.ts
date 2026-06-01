import { Schema } from "effect"
import type { PermissionConfig, PermissionOf, RoleConfig, RoleOf } from "./types.ts"

const nonEmptyLiterals = <const Values extends readonly [string, ...string[]]>(values: Values) =>
  Schema.Literals(values)

export const objectRefSchema = Schema.Struct({
  type: Schema.String,
  id: Schema.String
})

export const subjectSchema = objectRefSchema
export const scopeSchema = objectRefSchema

export const resourceSchema = Schema.Struct({
  type: Schema.String,
  id: Schema.String,
  scopes: Schema.Array(scopeSchema)
})

export const makeAccessSchemas = <
  const Permissions extends PermissionConfig,
  const Roles extends RoleConfig<PermissionOf<Permissions>>
>(definition: { readonly permissions: Permissions; readonly roles: Roles }) => {
  type Permission = PermissionOf<Permissions>
  type Role = RoleOf<Roles>
  type ScopeType = keyof Permissions & string

  const permissionValues = Object.entries(definition.permissions).flatMap(([resource, actions]) =>
    actions.map((action) => `${resource}:${action}`)
  ) as Permission[]
  const roleValues = Object.keys(definition.roles) as Role[]
  const scopeTypeValues = Object.keys(definition.permissions) as ScopeType[]

  if (permissionValues.length === 0) {
    throw new Error("defineAccess requires at least one permission")
  }
  if (roleValues.length === 0) {
    throw new Error("defineAccess requires at least one role")
  }

  const Permission = nonEmptyLiterals(permissionValues as [Permission, ...Permission[]])
  const Role = nonEmptyLiterals(roleValues as [Role, ...Role[]])
  const ScopeType = nonEmptyLiterals(scopeTypeValues as [ScopeType, ...ScopeType[]])

  const Scope = Schema.Struct({
    type: ScopeType,
    id: Schema.String
  })

  const Resource = Schema.Struct({
    type: ScopeType,
    id: Schema.String,
    scopes: Schema.Array(Scope)
  })

  const RoleBinding = Schema.Struct({
    subject: subjectSchema,
    scope: Scope,
    role: Role
  })

  const RoleAssignmentRow = Schema.Struct({
    subjectType: Schema.String,
    subjectId: Schema.String,
    scopeType: ScopeType,
    scopeId: Schema.String,
    role: Role
  })

  return {
    Permission,
    Role,
    ScopeType,
    Subject: subjectSchema,
    Scope,
    Resource,
    RoleBinding,
    RoleAssignmentRow
  }
}
