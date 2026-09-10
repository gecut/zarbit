import type { Identity } from "@zarbit/contracts";

export function createAuthRouter<TProcedure>(builder: {
  identity: {
    handler: (
      fn: (opt: { context: { user: { id: string } & Identity } }) => Identity,
    ) => TProcedure;
  };
}): { identity: TProcedure } {
  return {
    identity: builder.identity.handler(({ context }) => {
      const { id: _, ...identity } = context.user;
      return identity;
    }),
  };
}
