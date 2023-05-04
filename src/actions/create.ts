import {
  captureExec,
  createCliAction,
  cyan,
  ExitCode,
  fsExists,
  inheritExec,
  joinPath,
  parseYaml,
  resolvePath,
  stringifyYaml,
  Type,
  writeAll,
} from "../deps.ts";
import {
  multipass,
  multipassCaptureSsh,
  multipassPostStart,
  multipassTailCloudInitOutputLog,
  multipassWaitForState,
} from "../multipass.ts";
import { InstanceConfig, InstanceConfigPathSchema, InstanceState } from "../types.ts";
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
  { ip, instance }: { ip: string; instance: InstanceConfig },
) {
  const { name, sshDirectoryPath } = instance;
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
  kubeconfig.clusters[0].name = name;
  kubeconfig.contexts[0].context.cluster = name;
  kubeconfig.contexts[0].context.user = name;
  kubeconfig.contexts[0].name = name;
  kubeconfig["current-context"] = name;
  kubeconfig.users[0].name = name;

  const tempDir = await Deno.makeTempDir();
  const tempKubeConfigFile = joinPath(tempDir, "kubeconfig.yaml");
  await Deno.writeTextFile(tempKubeConfigFile, stringifyYaml(kubeconfig));

  const kubeDir = joinPath(Deno.env.get("HOME") ?? "", ".kube");
  const kubeConfigFile = joinPath(kubeDir, "config");

  await inheritExec({ cmd: ["mkdir", "-p", kubeDir] });

  if (await fsExists(kubeConfigFile)) {
    const backupKubeConfigFile = joinPath(kubeDir, `config-${new Date().toISOString()}`);
    log("Backing up existing kubeconfig to", cyan(backupKubeConfigFile));
    await Deno.copyFile(kubeConfigFile, backupKubeConfigFile);
  }

  log(`Merging instance's kubeconfig to`, cyan(kubeConfigFile));
  const newKubeConfig = (await captureExec({
    cmd: ["kubectl", "config", "view", "--flatten"],
    env: { KUBECONFIG: `${tempKubeConfigFile}:${kubeConfigFile}` },
  })).out;

  await Deno.writeTextFile(kubeConfigFile, newKubeConfig);

  ok("Kubeconfig has been updated. The current context should now be", cyan(name));
}

export async function createInstance(instance: InstanceConfig) {
  const { sshDirectoryPath, cpus, memoryGiBs, diskGiBs, image, name } = instance;

  await generateSshKeyPairIfNotExists(instance);

  const sshPublicKey = await getSshPublicKey(sshDirectoryPath);
  const cloudInitConfig = createCloudInitConfig({ sshPublicKey, instance });
  const tempDir = await Deno.makeTempDir();
  const cloudInitFilePath = joinPath(tempDir, "cloud-init.yaml");
  await Deno.writeTextFile(cloudInitFilePath, stringifyYaml(cloudInitConfig));

  const cloudInitLogTailingAbort = new AbortController();
  const multipassLaunchStdoutAbort = new AbortController();

  const cloudInitLogTailingPromise = (async () => {
    await multipassWaitForState({
      isReady: (state) => (state === InstanceState.Starting || state === InstanceState.Running),
      instance,
      abortSignal: cloudInitLogTailingAbort.signal,
    });

    multipassLaunchStdoutAbort.abort();

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
        "--cloud-init",
        cloudInitFilePath,
      ],
      stdout: {
        async read(readable: ReadableStream<Uint8Array>) {
          try {
            for await (const chunk of readable) {
              if (multipassLaunchStdoutAbort.signal.aborted) {
                continue;
              }
              await writeAll(Deno.stdout, chunk);
            }
          } finally {
            await readable.cancel();
          }
        },
      },
    });
  } catch (e) {
    err("Failed launching", e.toString());
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

  const ip = await multipassPostStart(instance);

  await updateKubeconfig({ ip, instance });
}

export default createCliAction(
  Type.Object({
    config: InstanceConfigPathSchema,
  }),
  async ({ config: configPath }) => {
    const absoluteConfigPath = resolvePath(configPath);
    const instance = await loadInstanceConfig(absoluteConfigPath);

    await createInstance(instance);

    return ExitCode.Zero;
  },
);
