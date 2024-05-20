import { createCliAction, ExitCode, resolvePath } from "../deps.ts";
import { multipassInfo, multipassK3sKillAll, multipassStop, multipassUnroute } from "../multipass.ts";
import { InstanceConfigPathSchema, InstanceState } from "../types.ts";
import { getExternalIp, loadInstanceConfig, ok } from "../utils.ts";

export default createCliAction(
  {
    config: InstanceConfigPathSchema,
  },
  async ({ config: configPath }) => {
    const absoluteConfigPath = resolvePath(configPath);
    const instance = await loadInstanceConfig(absoluteConfigPath);
    const { sshDirectoryPath, name } = instance;

    const { state, ipv4 } = await multipassInfo(instance);

    if (state !== InstanceState.Running) {
      throw new Error(`Instance '${name}' is not in 'Running' state. Current state is '${state}'`);
    }

    const ip = getExternalIp(ipv4, instance.externalNetworkCidr);

    if (instance.role === "server" && instance.clusterInit) {
      await multipassUnroute({ instance });
    }
    await multipassK3sKillAll({ ip, sshDirectoryPath });
    await multipassStop(instance);

    ok(`Instance '${name}' has been stopped`);

    return ExitCode.Zero;
  },
);
