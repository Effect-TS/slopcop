import * as Context from "effect/Context"
import * as HttpApiMiddleware from "effect/unstable/httpapi/HttpApiMiddleware"
import * as HttpApiSecurity from "effect/unstable/httpapi/HttpApiSecurity"
import { Forbidden, Unauthenticated } from "./Errors.ts"

export interface LabelingAdminIdentityShape {
  readonly actor: string
  readonly role: "viewer" | "administrator"
}

export class LabelingAdminIdentity extends Context.Service<
  LabelingAdminIdentity,
  LabelingAdminIdentityShape
>()("@slopcop/api/LabelingAdminIdentity") {}

export const LabelingAdminBearer = HttpApiSecurity.bearer

export class LabelingAdminMiddleware extends HttpApiMiddleware.Service<
  LabelingAdminMiddleware,
  { provides: LabelingAdminIdentity }
>()("@slopcop/api/LabelingAdminMiddleware", {
  error: [Unauthenticated, Forbidden],
  security: { bearer: LabelingAdminBearer },
}) {}
