import { Context } from "effect"
import type { Subject } from "./types.ts"

export class CurrentSubject extends Context.Service<CurrentSubject, Subject>()("effect-access/CurrentSubject") {}
