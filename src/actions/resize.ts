import { createCliAction, ExitCode, resolvePath } from "../deps.ts";
import { multipassInfo, multipassResize } from "../multipass.ts";
import { InstanceConfigPathSchema, InstanceState } from "../types.ts";
import { loadInstanceConfig, ok } from "../utils.ts";

export default createCliAction(
  {
    config: InstanceConfigPathSchema,
  },
  async ({ config: configPath }) => {
    const absoluteConfigPath = resolvePath(configPath);
    const instance = await loadInstanceConfig(absoluteConfigPath);
    const { name } = instance;

    const { state } = await multipassInfo(instance);

    if (state !== InstanceState.Stopped) {
      throw new Error(`Instance '${name}' is not in 'Stopped' state. Current state is '${state}'`);
    }

    await multipassResize(instance);

    ok(`Instance '${name}' has been resized`);

    return ExitCode.Zero;
  },
);
