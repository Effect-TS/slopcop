import { RootApi } from "@slopcop/api/RootApi"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient"

export class ApiClient extends Context.Service<
  ApiClient,
  HttpApiClient.ForApi<typeof RootApi>
>()("@slopcop/web/ApiClient", {
  make: HttpApiClient.make(RootApi).pipe(Effect.provide(FetchHttpClient.layer)),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
