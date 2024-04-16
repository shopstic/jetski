import { createCliAction, ExitCode, Type } from "../deps.ts";

export default createCliAction(
  Type.Object({}),
  () => {
    console.log({ app: Deno.env.get("JETSKI_VERSION") ?? "dev", ...Deno.version });
    return Promise.resolve(ExitCode.Zero);
  },
);
