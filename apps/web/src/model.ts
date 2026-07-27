import { Schema as S } from "effect"

import { AppRoute } from "./route"

export const Model = S.Struct({ route: AppRoute })
export type Model = typeof Model.Type
