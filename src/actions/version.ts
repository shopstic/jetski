import { createCliAction, ExitCode } from "../deps.ts";

export default createCliAction(
  {},
  () => {
    console.log({ app: Deno.env.get("JETSKI_VERSION") ?? "dev", ...Deno.version });
    return Promise.resolve(ExitCode.Zero);
  },
);
