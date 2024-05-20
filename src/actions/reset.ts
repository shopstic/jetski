import { createCliAction, ExitCode, resolvePath, Type, yellow } from "../deps.ts";
import { InstanceConfigPathSchema } from "../types.ts";
import { loadInstanceConfig } from "../utils.ts";
import { createInstance } from "./create.ts";
import { destroyInstance } from "./destroy.ts";

export default createCliAction(
  {
    config: InstanceConfigPathSchema,
    skipConfirm: Type.Optional(Type.Boolean({
      default: false,
    })),
  },
  async ({ config: configPath, skipConfirm }, signal) => {
    const absoluteConfigPath = resolvePath(configPath);
    const instance = await loadInstanceConfig(absoluteConfigPath);
    const { name } = instance;

    if (
      !skipConfirm &&
      !confirm(
        yellow(
          `Going to destroy and recreate instance '${name}'. Are you sure?`,
        ),
      )
    ) {
      return ExitCode.One;
    }

    await destroyInstance(instance);
    await createInstance(instance, signal);

    return ExitCode.Zero;
  },
);
