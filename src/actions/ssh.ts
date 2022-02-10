import { createCliAction, ExitCode, gray, resolvePath, Type } from "../deps.ts";
import { multipassInfo, multipassSshInteractive } from "../multipass.ts";
import { InstanceConfigPathSchema, InstanceState } from "../types.ts";
import { loadInstanceConfig, log } from "../utils.ts";

export default createCliAction(
  Type.Object({
    config: InstanceConfigPathSchema,
  }),
  async (args, unparsedArgs) => {
    const absoluteConfigPath = resolvePath(args.config);
    const instance = await loadInstanceConfig(absoluteConfigPath);
    const { name, sshDirectoryPath } = instance;

    log(gray("Obtaining instance IP..."));
    const { state, ipv4 } = await multipassInfo({ name });

    if (state !== InstanceState.Running) {
      throw new Error(`Instance '${name}' is not in 'Running' state. Current state is '${state}'`);
    }

    const exitCode = await multipassSshInteractive({
      cmd: unparsedArgs,
      sshDirectoryPath,
      ip: ipv4[0],
    });

    return new ExitCode(exitCode);
  },
  (command, args) => `${command} ${args.join(" ")} -- optional command here`,
);
