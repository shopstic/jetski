import { createCliAction, ExitCode, resolvePath, Type } from "../deps.ts";
import { multipassInfo, multipassSuspend, multipassUnroute } from "../multipass.ts";
import { InstanceConfigPathSchema, InstanceState } from "../types.ts";
import { loadInstanceConfig, ok } from "../utils.ts";

export default createCliAction(
  Type.Object({
    config: InstanceConfigPathSchema,
  }),
  async ({ config: configPath }) => {
    const absoluteConfigPath = resolvePath(configPath);
    const instance = await loadInstanceConfig(absoluteConfigPath);
    const { name } = instance;

    const { state } = await multipassInfo(instance);

    if (state !== InstanceState.Running) {
      throw new Error(`Instance '${name}' is not in 'Running' state. Current state is '${state}'`);
    }

    if (instance.role === "server" && instance.clusterInit) {
      await multipassUnroute({ instance });
    }
    await multipassSuspend(instance);

    ok(`Instance '${name}' has been suspended`);

    return ExitCode.Zero;
  },
);
