import { createCliAction, ExitCode } from "../deps.ts";
import { default as config } from "../../deno.json" with { type: "json" };

export default createCliAction(
  {},
  () => {
    console.log(JSON.stringify({ app: config.version === "0.0.0" ? "dev" : config.version, ...Deno.version }, null, 2));
    return Promise.resolve(ExitCode.Zero);
  },
);
