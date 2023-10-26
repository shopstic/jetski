import { createCliAction, cyan, ExitCode, resolvePath, Type, yellow } from "../deps.ts";
import { multipass, multipassInfo, multipassK3sKillAll, multipassStop, multipassUnroute } from "../multipass.ts";
import { InstanceConfig, InstanceConfigPathSchema, InstanceState } from "../types.ts";
import { getExternalIp, loadInstanceConfig, log, ok } from "../utils.ts";

export async function destroyInstance(instance: InstanceConfig) {
  const { sshDirectoryPath, name } = instance;
  const { state, ipv4 } = await multipassInfo(instance);

  if (state === InstanceState.Running) {
    const ip = getExternalIp(ipv4, instance.externalNetworkCidr);

    log(`Going to destroy ${cyan(name)} at ${cyan(ip)}`);

    if (instance.role === "server") {
      await multipassUnroute({ ip, instance });
    }

    await multipassK3sKillAll({ ip, sshDirectoryPath });
    await multipassStop(instance);
  }

  await multipass({ command: "delete", args: ["--purge", name] });

  ok(`Instance '${name}' has been destroyed`);
}

export default createCliAction(
  Type.Object({
    config: InstanceConfigPathSchema,
    skipConfirm: Type.Optional(Type.Boolean({
      default: false,
    })),
  }),
  async ({ config: configPath, skipConfirm }) => {
    const absoluteConfigPath = resolvePath(configPath);
    const instance = await loadInstanceConfig(absoluteConfigPath);
    const { name } = instance;

    if (
      !skipConfirm &&
      !confirm(yellow(`Going to destroy instance '${name}'. Are you sure?`))
    ) {
      return ExitCode.One;
    }

    await destroyInstance(instance);

    return ExitCode.Zero;
  },
);
