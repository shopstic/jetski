import { createCliAction, ExitCode, gray, NonEmptyString, resolvePath, Type } from "../deps.ts";
import { multipassInfo, multipassSshInteractive } from "../multipass.ts";
import { InstanceConfigPathSchema, InstanceState } from "../types.ts";
import { getExternalIp, loadInstanceConfig, log } from "../utils.ts";

export default createCliAction(
  {
    config: InstanceConfigPathSchema,
    "--": Type.Array(NonEmptyString()),
  },
  async ({ config, "--": cmd }) => {
    const absoluteConfigPath = resolvePath(config);
    const instance = await loadInstanceConfig(absoluteConfigPath);
    const { name, sshDirectoryPath } = instance;

    log(gray("Obtaining instance IP..."));
    const { state, ipv4 } = await multipassInfo({ name });

    if (state !== InstanceState.Running) {
      throw new Error(`Instance '${name}' is not in 'Running' state. Current state is '${state}'`);
    }

    const ip = getExternalIp(ipv4, instance.externalNetworkCidr);
    log(gray(`Instance IP is '${ip}'`));

    const exitCode = await multipassSshInteractive({
      cmd: cmd,
      sshDirectoryPath,
      ip: getExternalIp(ipv4, instance.externalNetworkCidr),
    });

    return new ExitCode(exitCode);
  },
  (command, args) => `${command} ${args.join(" ")} -- optional command here`,
);
