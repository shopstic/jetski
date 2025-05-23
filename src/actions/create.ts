import {
  captureExec,
  createCliAction,
  cyan,
  ExitCode,
  fsExists,
  gray,
  inheritExec,
  joinPath,
  parseYaml,
  resolvePath,
  stringifyYaml,
} from "../deps.ts";
import {
  multipass,
  multipassCaptureSsh,
  multipassPostStart,
  multipassTailCloudInitOutputLog,
  multipassWaitForState,
} from "../multipass.ts";
import type { InstanceConfig, ServerInstanceConfig } from "../types.ts";
import { InstanceConfigPathSchema, InstanceState } from "../types.ts";
import {
  createCloudInitConfig,
  err,
  generateSshKeyPairIfNotExists,
  getSshPublicKey,
  loadInstanceConfig,
  log,
  ok,
} from "../utils.ts";

export async function updateKubeconfig(
  { ip, instance }: { ip: string; instance: ServerInstanceConfig },
) {
  const { name: instanceName, contextName = instanceName, sshDirectoryPath } = instance;

  log(
    "Fetching instance's kubeconfig from /etc/rancher/k3s/k3s.yaml over SSH",
  );
  const kubeconfig = parseYaml(
    (await multipassCaptureSsh({
      cmd: ["sudo", "cat", "/etc/rancher/k3s/k3s.yaml"],
      sshDirectoryPath,
      ip,
    })).out,
    // deno-lint-ignore no-explicit-any
  ) as any;

  kubeconfig.clusters[0].cluster.server = `https://${ip}:6443`;
  kubeconfig.clusters[0].name = contextName;
  kubeconfig.contexts[0].context.cluster = contextName;
  kubeconfig.contexts[0].context.user = contextName;
  kubeconfig.contexts[0].name = contextName;
  kubeconfig["current-context"] = contextName;
  kubeconfig.users[0].name = contextName;

  const tempDir = await Deno.makeTempDir();
  const tempKubeConfigFile = joinPath(tempDir, "kubeconfig.yaml");
  await Deno.writeTextFile(tempKubeConfigFile, stringifyYaml(kubeconfig));

  const kubeDir = joinPath(Deno.env.get("HOME") ?? "", ".kube");
  const kubeBackupDir = joinPath(kubeDir, "backup");
  const kubeConfigFile = joinPath(kubeDir, "config");

  await inheritExec({ cmd: ["mkdir", "-p", kubeBackupDir] });

  if (await fsExists(kubeConfigFile)) {
    const backupKubeConfigFile = joinPath(kubeBackupDir, `config-${new Date().toISOString()}`);
    log("Backing up existing kubeconfig to", cyan(backupKubeConfigFile));
    await Deno.copyFile(kubeConfigFile, backupKubeConfigFile);
  }

  log(`Merging instance's kubeconfig to`, cyan(kubeConfigFile));
  const newKubeConfig = (await captureExec({
    cmd: ["kubectl", "config", "view", "--flatten"],
    env: { KUBECONFIG: `${tempKubeConfigFile}:${kubeConfigFile}` },
  })).out;

  await Deno.writeTextFile(kubeConfigFile, newKubeConfig);

  ok("Kubeconfig has been updated. The current context should now be", cyan(contextName));
}

export async function createInstance(instance: InstanceConfig, signal: AbortSignal) {
  const { sshDirectoryPath, cpus, memoryGiBs, diskGiBs, image, name, bridged } = instance;

  await generateSshKeyPairIfNotExists(instance);

  const sshPublicKey = await getSshPublicKey(sshDirectoryPath);
  const cloudInitConfig = await createCloudInitConfig({ sshPublicKey, instance });
  const tempDir = await Deno.makeTempDir();
  const cloudInitFilePath = joinPath(tempDir, "cloud-init.yaml");
  log("Generated cloud-init.yaml");
  log(gray("--"));
  log(gray("# Begin cloud-init.yaml"));
  log(gray(stringifyYaml(cloudInitConfig)));
  log(gray("# End cloud-init.yaml"));
  await Deno.writeTextFile(cloudInitFilePath, stringifyYaml(cloudInitConfig));

  const cloudInitLogTailingAbort = new AbortController();
  const multipassLaunchStdoutAbort = new AbortController();

  const cloudInitLogTailingPromise = (async () => {
    await multipassWaitForState({
      isReady: (state) => (state === InstanceState.Starting || state === InstanceState.Running),
      instance,
      abortSignal: cloudInitLogTailingAbort.signal,
    });

    if (!multipassLaunchStdoutAbort.signal.aborted) {
      multipassLaunchStdoutAbort.abort();
    }

    return await multipassTailCloudInitOutputLog({ instance, abortSignal: cloudInitLogTailingAbort.signal });
  })();

  try {
    await multipass({
      command: "launch",
      args: [
        ...(image ? [image] : []),
        "-v",
        "-c",
        String(cpus),
        "-m",
        `${memoryGiBs}G`,
        "-d",
        `${diskGiBs}G`,
        "-n",
        name,
        ...(bridged ? ["--bridged"] : []),
        "--cloud-init",
        cloudInitFilePath,
      ],
      stdout: {
        async read(readable: ReadableStream<Uint8Array>) {
          try {
            await readable
              .pipeThrough(
                new TransformStream<Uint8Array, string>({
                  transform(chunk: Uint8Array, controller: TransformStreamDefaultController<string>) {
                    const output = new TextDecoder().decode(chunk).replaceAll(
                      "[2K[0A[0E[2K[0A[0E",
                      "\n" + gray("[$ multipass ]") + " ",
                    ).replace(
                      /(\/|-|\\|\|)/g,
                      ".",
                    );
                    controller.enqueue(output);
                  },
                }),
              )
              .pipeThrough(new TextEncoderStream())
              .pipeTo(
                Deno.stdout.writable,
                {
                  preventClose: true,
                  preventAbort: true,
                  preventCancel: true,
                  signal: multipassLaunchStdoutAbort.signal,
                },
              );
          } catch (e) {
            if (multipassLaunchStdoutAbort.signal.aborted) {
              return;
            }
            throw e;
          }
        },
      },
    });
  } catch (e) {
    err("Failed launching", e);
    return ExitCode.One;
  } finally {
    await Deno.remove(tempDir, { recursive: true });
    cloudInitLogTailingAbort.abort();
  }

  try {
    await cloudInitLogTailingPromise;
  } catch {
    // Ignore
  }

  const ip = await multipassPostStart(instance, signal);

  if (instance.role === "server" && instance.clusterInit) {
    await updateKubeconfig({ ip: instance.keepalived?.virtualIp ?? ip, instance });
  } else {
    ok(`Instance ${cyan(name)} is ready!`);
  }
}

export default createCliAction(
  {
    config: InstanceConfigPathSchema,
  },
  async ({ config: configPath }, signal) => {
    const absoluteConfigPath = resolvePath(configPath);
    const instance = await loadInstanceConfig(absoluteConfigPath);

    await createInstance(instance, signal);

    return ExitCode.Zero;
  },
);
