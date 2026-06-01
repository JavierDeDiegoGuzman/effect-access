import { Effect } from "effect"
import { Forbidden, forbidden } from "./forbidden.ts"

export type Policy<Error = never, Requirements = never> = Effect.Effect<void, Forbidden | Error, Requirements>

export const guard = <Error, Requirements>(policy: Policy<Error, Requirements>) =>
  <A, Error2, Requirements2>(self: Effect.Effect<A, Error2, Requirements2>): Effect.Effect<A, Error | Error2 | Forbidden, Requirements | Requirements2> =>
    Effect.flatMap(policy, () => self)

type PolicyErrorOf<P> = P extends Policy<infer Error, unknown> ? Error : never
type PolicyRequirementsOf<P> = P extends Policy<unknown, infer Requirements> ? Requirements : never

type CombinedPolicy<Policies extends readonly Policy<unknown, unknown>[]> = Policy<
  PolicyErrorOf<Policies[number]>,
  PolicyRequirementsOf<Policies[number]>
>

export const all = <const Policies extends readonly Policy<unknown, unknown>[]>(
  ...policies: Policies
): CombinedPolicy<Policies> =>
  Effect.all(policies as Iterable<Policy<unknown, unknown>>, { concurrency: 1, discard: true }) as CombinedPolicy<Policies>

export const any = <const Policies extends readonly Policy<unknown, unknown>[]>(
  ...policies: Policies
): CombinedPolicy<Policies> => {
  if (policies.length === 0) {
    return Effect.fail(forbidden({ message: "No policy matched" })) as CombinedPolicy<Policies>
  }

  return Effect.firstSuccessOf(policies) as CombinedPolicy<Policies>
}

export const toBool = <Error, Requirements>(
  policy: Policy<Error, Requirements>
): Effect.Effect<boolean, Error, Requirements> =>
  Effect.matchEffect(policy, {
    onSuccess: () => Effect.succeed(true),
    onFailure: (error) =>
      error instanceof Forbidden ? Effect.succeed(false) : Effect.fail(error as Error)
  })
