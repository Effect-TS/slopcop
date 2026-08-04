export interface ResourceNames {
  readonly name: (resourceName: string) => string
  readonly rateLimitNamespace: (
    production: number,
    development: number,
  ) => number
}

export const make = (options: {
  readonly dev: boolean
  readonly stage: string
  readonly suffix?: string
}): ResourceNames => {
  const isProduction = !options.dev && options.stage === "prod"
  const suffix = options.suffix ?? (isProduction ? "" : `-${options.stage}`)
  return {
    name: (resourceName) => `${resourceName}${suffix}`,
    rateLimitNamespace: (production, development) =>
      isProduction ? production : development,
  }
}

export const production = make({ dev: false, stage: "prod" })
