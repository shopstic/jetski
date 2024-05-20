import { createCliAction, ExitCode, resolvePath } from "../deps.ts";
import { multipassInfo, multipassPostStart } from "../multipass.ts";
import { InstanceConfigPathSchema, InstanceState } from "../types.ts";
import { err, loadInstanceConfig, ok } from "../utils.ts";
import { updateKubeconfig } from "./create.ts";

export default createCliAction(
  {
    config: InstanceConfigPathSchema,
  },
  async ({ config: configPath }, signal) => {
    const absoluteConfigPath = resolvePath(configPath);
    const instance = await loadInstanceConfig(absoluteConfigPath);

    if (instance.role !== "server") {
      err("Expected a instance with role server, instead got", instance.role, "with name", instance.name);
      return ExitCode.One;
    }

    const { name } = instance;
    const { state } = await multipassInfo({ name });

    if (state !== InstanceState.Running) {
      throw new Error(`Instance '${name}' is not in 'Running' state. Current state is '${state}'`);
    }

    const ip = await multipassPostStart(instance, signal);
    const clusterIp = instance.keepalived?.virtualIp ?? ip;

    await updateKubeconfig({ ip: clusterIp, instance });

    ok(`Local routes and kubeconfig for instance '${name}' have been updated with IP: ${clusterIp}`);

    return ExitCode.Zero;
  },
);
