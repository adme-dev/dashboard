type ExportedHandler<Env = unknown> = {
  fetch?: (request: Request, env: Env, ctx: unknown) => Response | Promise<Response>
}
