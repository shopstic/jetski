import { createCliAction, ExitCode, resolvePath, Type } from "../deps.ts";
import { multipassInfo, multipassPostStart } from "../multipass.ts";
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

    if (state !== InstanceState.Running) {
      throw new Error(`Instance '${name}' is not in 'Running' state. Current state is '${state}'`);
    }

    const ip = await multipassPostStart(instance);
    await updateKubeconfig({ ip, instance });

    ok(`Local routes and kubeconfig for instance '${name}' have been updated with IP: ${ip}`);

    return ExitCode.Zero;
  },
);
