import { Context, Effect } from "effect"
import { forbidden } from "./forbidden.ts"
import { effectiveScopes, resource as makeResource, sameRef, scope as makeScope, subject as makeSubject } from "./refs.ts"
import { makeAccessSchemas } from "./schema.ts"
import { CurrentSubject } from "./services.ts"
import { guard, all, any, toBool, type Policy } from "./policy.ts"
import type {
  PermissionConfig,
  PermissionOf,
  Resource,
  ResourceInput,
  ResourceMapper,
  ResourceMappers,
  ResourceTypeOf,
  ResourceTypeOfPermission,
  RoleBinding,
  RoleConfig,
  RoleOf,
  RoleStoreShape,
  Scope,
  Subject
} from "./types.ts"

export interface AccessDefinition<
  Permissions extends PermissionConfig,
  Roles extends RoleConfig<PermissionOf<Permissions>>,
  Resources extends ResourceMappers<ResourceTypeOf<Permissions>> = {}
> {
  readonly permissions: Permissions
  readonly roles: Roles
  readonly resources?: Resources
}

const unique = <A>(values: Iterable<A>): readonly A[] => Array.from(new Set(values))

export const defineAccess = <
  const Permissions extends PermissionConfig,
  const Roles extends RoleConfig<PermissionOf<Permissions>>,
  const Resources extends ResourceMappers<ResourceTypeOf<Permissions>> = {}
>(definition: AccessDefinition<Permissions, Roles, Resources>) => {
  type Permission = PermissionOf<Permissions>
  type Role = RoleOf<Roles>
  type ScopeType = ResourceTypeOf<Permissions>

  const permissionValues = Object.entries(definition.permissions).flatMap(([resource, actions]) =>
    actions.map((action) => `${resource}:${action}`)
  ) as Permission[]
  const roleValues = Object.keys(definition.roles) as Role[]
  const permissionSet = new Set<Permission>(permissionValues)
  const roleSet = new Set<Role>(roleValues)
  const schemas = makeAccessSchemas(definition)
  class RoleStore extends Context.Service<RoleStore, RoleStoreShape<Role, ScopeType, unknown>>()("effect-access/RoleStore") {}

  for (const [role, permissions] of Object.entries(definition.roles)) {
    for (const permission of permissions) {
      if (!permissionSet.has(permission as Permission)) {
        throw new Error(`Role ${role} references unknown permission ${permission}`)
      }
    }
  }

  const subject = makeSubject

  const scope = <const Type extends ScopeType, const Id extends string>(type: Type, id: Id): Scope<Type, Id> =>
    makeScope(type, id)

  const resource = <const Type extends ScopeType, const Id extends string>(
    type: Type,
    id: Id,
    options?: { readonly scopes?: readonly Scope<ScopeType>[] }
  ): Resource<Type, Id> => makeResource(type, id, options)

  const resourceTypeOfPermission = <const PermissionValue extends Permission>(
    permission: PermissionValue
  ): Extract<ResourceTypeOfPermission<PermissionValue>, ScopeType> =>
    permission.slice(0, permission.indexOf(":")) as Extract<ResourceTypeOfPermission<PermissionValue>, ScopeType>

  const toResource = <const PermissionValue extends Permission>(
    permission: PermissionValue,
    input: ResourceInput<Resources, ScopeType, PermissionValue>
  ): Resource<Extract<ResourceTypeOfPermission<PermissionValue>, ScopeType>> => {
    const type = resourceTypeOfPermission(permission)
    const mapper = definition.resources?.[type] as ResourceMapper<typeof type, typeof input> | undefined

    return mapper === undefined ? input as Resource<typeof type> : mapper(input)
  }

  const roleBinding = (input: {
    readonly subject: Subject
    readonly scope: Scope<ScopeType>
    readonly role: Role
  }): RoleBinding<Role, ScopeType> => input

  const makeRoleStore = <Error = never>(
    bindings: Iterable<RoleBinding<Role, ScopeType>>
  ): RoleStoreShape<Role, ScopeType, Error> => {
    const allBindings = Array.from(bindings)

    return {
      getRoles: ({ subject, scopes }) =>
        Effect.succeed(
          unique(
            allBindings
              .filter((binding) =>
                sameRef(binding.subject, subject) && scopes.some((candidate) => sameRef(candidate, binding.scope))
              )
              .map((binding) => binding.role)
          )
        ) as Effect.Effect<readonly Role[], Error>
    }
  }

  const permissionsForRoles = (roles: Iterable<Role>): ReadonlySet<Permission> => {
    const permissions = new Set<Permission>()

    for (const role of roles) {
      const rolePermissions = definition.roles[role]
      if (rolePermissions !== undefined) {
        for (const permission of rolePermissions) {
          permissions.add(permission)
        }
      }
    }

    return permissions
  }

  const canFor = <Error = never>(
    permission: Permission,
    input: { readonly subject: Subject; readonly resource: Resource<ScopeType> }
  ): Effect.Effect<boolean, Error, typeof RoleStore.Identifier> =>
    Effect.flatMap(RoleStore, (store) =>
      Effect.map(
        store.getRoles({ subject: input.subject, scopes: effectiveScopes(input.resource) as readonly Scope<ScopeType>[] }),
        (roles) => permissionsForRoles(roles as readonly Role[]).has(permission)
      )
    ) as Effect.Effect<boolean, Error, typeof RoleStore.Identifier>

  const policyFor = <Error = never>(
    permission: Permission,
    input: { readonly subject: Subject; readonly resource: Resource<ScopeType> }
  ): Policy<Error, typeof RoleStore.Identifier> =>
    Effect.flatMap(canFor<Error>(permission, input), (allowed) =>
      allowed
        ? Effect.void
        : Effect.fail(
            forbidden({
              permission,
              subject: input.subject,
              resource: input.resource,
              message: `Missing permission: ${permission}`
            })
          )
    )

  const can = <const PermissionValue extends Permission, Error = never>(
    permission: PermissionValue,
    input: ResourceInput<Resources, ScopeType, PermissionValue>
  ): Effect.Effect<boolean, Error, typeof CurrentSubject.Identifier | typeof RoleStore.Identifier> =>
    Effect.flatMap(CurrentSubject, (currentSubject) =>
      canFor<Error>(permission, { subject: currentSubject, resource: toResource(permission, input) })
    )

  const policy = <const PermissionValue extends Permission, Error = never>(
    permission: PermissionValue,
    input: ResourceInput<Resources, ScopeType, PermissionValue>
  ): Policy<Error, typeof CurrentSubject.Identifier | typeof RoleStore.Identifier> =>
    Effect.flatMap(CurrentSubject, (currentSubject) =>
      policyFor<Error>(permission, { subject: currentSubject, resource: toResource(permission, input) })
    )

  const permission = policy

  const makePolicy = <Error = never, Requirements = never>(
    predicate: (subject: Subject) => Effect.Effect<boolean, Error, Requirements>,
    options?: { readonly message?: string }
  ): Policy<Error, typeof CurrentSubject.Identifier | Requirements> =>
    Effect.flatMap(CurrentSubject, (currentSubject) =>
      Effect.flatMap(predicate(currentSubject), (allowed) =>
        allowed
          ? Effect.void
          : Effect.fail(
              forbidden({
                subject: currentSubject,
                message: options?.message ?? "Policy denied"
              })
            )
      )
    )

  const require = <const PermissionValue extends Permission, Error = never>(
    permission: PermissionValue,
    input: ResourceInput<Resources, ScopeType, PermissionValue>
  ) => guard(policy<PermissionValue, Error>(permission, input))

  return {
    definition,
    permissions: {
      config: definition.permissions,
      all: permissionSet as ReadonlySet<Permission>,
      has: (permission: string): permission is Permission => permissionSet.has(permission as Permission)
    },
    roles: {
      config: definition.roles,
      all: roleSet as ReadonlySet<Role>,
      has: (role: string): role is Role => roleSet.has(role as Role)
    },
    schemas,
    CurrentSubject,
    RoleStore,
    subject,
    scope,
    resource,
    toResource,
    effectiveScopes,
    roleBinding,
    makeRoleStore,
    permissionsForRoles,
    can,
    canFor,
    permission,
    policy,
    makePolicy,
    policyFor,
    guard,
    require,
    all,
    any,
    toBool
  }
}
