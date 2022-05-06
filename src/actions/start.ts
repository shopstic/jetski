import { createCliAction, ExitCode, resolvePath, Type } from "../deps.ts";
import { multipassInfo, multipassPostStart, multipassStart } from "../multipass.ts";
import { InstanceConfigPathSchema, InstanceState } from "../types.ts";
import { loadInstanceConfig, ok } from "../utils.ts";
import { updateKubeconfig } from "./create.ts";

export default createCliAction(
  Type.Object({
    config: InstanceConfigPathSchema,
  }),
  async ({ config: configPath }) => {
    const absoluteConfigPath = resolvePath(configPath);
    const instance = await loadInstanceConfig(absoluteConfigPath);
    const { name } = instance;
    const { state } = await multipassInfo({ name });

    if (state !== InstanceState.Stopped && state !== InstanceState.Suspended) {
      throw new Error(
        `Instance '${name}' is not in either 'Suspended' or 'Stopped' state. Current state is '${state}'`,
      );
    }

    await multipassStart(instance);
    const ip = await multipassPostStart(instance);
    await updateKubeconfig({ ip, instance });

    ok(`Instance '${name}' has been started`);

    return ExitCode.Zero;
  },
);
