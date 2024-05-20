import { createCliAction, ExitCode, gray, resolvePath } from "../deps.ts";
import { multipassInfo, multipassInheritSsh, multipassPostStart, multipassStart } from "../multipass.ts";
import { InstanceConfigPathSchema, InstanceState } from "../types.ts";
import { loadInstanceConfig, log, ok } from "../utils.ts";
import { updateKubeconfig } from "./create.ts";

export default createCliAction(
  {
    config: InstanceConfigPathSchema,
  },
  async ({ config: configPath }, signal) => {
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
    const ip = await multipassPostStart(instance, signal);

    if (state === InstanceState.Suspended) {
      log("Restarting chronyd to re-sync time after suspension...");
      await multipassInheritSsh({
        cmd: ["sudo", "systemctl", "restart", "chronyd"],
        sshDirectoryPath: instance.sshDirectoryPath,
        ip,
        abortSignal: signal,
        tag: gray("[ ssh ... systemctl restart chronyd ]"),
      });
    }

    if (instance.role === "server" && instance.clusterInit) {
      await updateKubeconfig({ ip: instance.keepalived?.virtualIp ?? ip, instance });
    }

    ok(`Instance '${name}' has been started`);

    return ExitCode.Zero;
  },
);
