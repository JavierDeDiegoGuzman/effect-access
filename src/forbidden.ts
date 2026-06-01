import { Data } from "effect"
import type { Resource, Subject } from "./types.ts"

export class Forbidden extends Data.TaggedError("Forbidden")<{
  readonly message: string
  readonly permission?: string
  readonly subject?: Subject
  readonly resource?: Resource
  readonly reasons?: readonly Forbidden[]
}> {}

export const forbidden = (input: {
  readonly permission?: string
  readonly subject?: Subject
  readonly resource?: Resource
  readonly message?: string
  readonly reasons?: readonly Forbidden[]
}): Forbidden =>
  new Forbidden({
    message: input.message ?? "Forbidden",
    ...(input.permission !== undefined ? { permission: input.permission } : {}),
    ...(input.subject !== undefined ? { subject: input.subject } : {}),
    ...(input.resource !== undefined ? { resource: input.resource } : {}),
    ...(input.reasons !== undefined ? { reasons: input.reasons } : {})
  })
