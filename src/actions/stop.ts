import { createCliAction, ExitCode, resolvePath, Type } from "../deps.ts";
import {
  multipassInfo,
  multipassK3sKillAll,
  multipassStop,
  multipassUnroute,
} from "../multipass.ts";
import { InstanceConfigPathSchema, InstanceState } from "../types.ts";
import { loadInstanceConfig, ok } from "../utils.ts";

export default createCliAction(
  Type.Object({
    config: InstanceConfigPathSchema,
  }),
  async ({ config: configPath }) => {
    const absoluteConfigPath = resolvePath(configPath);
    const instance = await loadInstanceConfig(absoluteConfigPath);
    const { sshDirectoryPath, name } = instance;

    const { state, ipv4 } = await multipassInfo(instance);

    if (state !== InstanceState.Running) {
      throw new Error(
        `Instance '${name}' is not in 'Running' state. Current state is '${state}'`,
      );
    }

    const ip = ipv4[0];

    await multipassUnroute({ ip, instance });
    await multipassK3sKillAll({ ip, sshDirectoryPath });
    await multipassStop(instance);

    ok(`Instance '${name}' has been stopped`);

    return ExitCode.Zero;
  },
);
