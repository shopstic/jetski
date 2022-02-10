import { createCliAction, ExitCode, Type } from "../deps.ts";
import version from "../version.ts";

export default createCliAction(
  Type.Object({}),
  () => {
    console.log({ app: version, ...Deno.version });
    return Promise.resolve(ExitCode.Zero);
  },
);
