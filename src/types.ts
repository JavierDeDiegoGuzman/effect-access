import type { Effect } from "effect"

export type PermissionConfig = Record<string, readonly string[]>

export type PermissionOf<Config extends PermissionConfig> = {
  readonly [Resource in keyof Config & string]: `${Resource}:${Config[Resource][number] & string}`
}[keyof Config & string]

export type ResourceTypeOf<Config extends PermissionConfig> = keyof Config & string

export type RoleConfig<Permission extends string = string> = Record<string, readonly Permission[]>

export type RoleOf<Roles extends RoleConfig> = keyof Roles & string

export interface ObjectRef<Type extends string = string, Id extends string = string> {
  readonly type: Type
  readonly id: Id
}

export type Subject<Type extends string = string, Id extends string = string> = ObjectRef<Type, Id>
export type Scope<Type extends string = string, Id extends string = string> = ObjectRef<Type, Id>

export interface Resource<Type extends string = string, Id extends string = string> extends ObjectRef<Type, Id> {
  readonly scopes: readonly Scope[]
}

export type ResourceMapper<Type extends string = string, Input = never> = (input: Input) => Resource<Type>

export type ResourceMappers<ScopeType extends string = string> = Partial<{
  readonly [Type in ScopeType]: ResourceMapper<Type>
}>

export type ResourceTypeOfPermission<Permission extends string> = Permission extends `${infer Type}:${string}` ? Type : never

export type ResourceInput<
  Resources extends ResourceMappers,
  ScopeType extends string,
  Permission extends string
> = Extract<ResourceTypeOfPermission<Permission>, ScopeType> extends infer Type extends ScopeType
  ? Type extends keyof Resources
    ? Resources[Type] extends ResourceMapper<Type, infer Input>
      ? Input
      : never
    : Resource<Type>
  : never

export interface RoleBinding<Role extends string = string, ScopeType extends string = string> {
  readonly subject: Subject
  readonly scope: Scope<ScopeType>
  readonly role: Role
}

export interface RoleQuery<ScopeType extends string = string> {
  readonly subject: Subject
  readonly scopes: readonly Scope<ScopeType>[]
}

export interface RoleStoreShape<Role extends string = string, ScopeType extends string = string, Error = never> {
  readonly getRoles: (query: RoleQuery<ScopeType>) => Effect.Effect<readonly Role[], Error>
}

export type RoleStoreImplementation<AccessOrRole = string, ScopeTypeOrError = string, Error = never> =
  [AccessOrRole] extends [string]
    ? RoleStoreShape<AccessOrRole, ScopeTypeOrError extends string ? ScopeTypeOrError : never, Error>
    : AccessOrRole extends { readonly RoleStore: { readonly Service: RoleStoreShape<infer Role, infer Scope, unknown> } }
      ? RoleStoreShape<Role, Scope, ScopeTypeOrError>
      : never
