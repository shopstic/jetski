import {
  assertExists,
  captureExec,
  cyan,
  delay,
  ensureFile,
  ExecAbortedError,
  gray,
  inheritExec,
  memoizePromise,
  NonZeroExitError,
  printErrLines,
  printOutLines,
  StdInputBehavior,
  StdOutputBehavior,
  validate,
} from "./deps.ts";
import { InstanceConfig, InstanceState, JoinMetadata, MultipassInfo, ServerInstanceConfig } from "./types.ts";
import { err, getExternalIp, log, ok, print } from "./utils.ts";

export const multipassBin = memoizePromise(() => locateMultipassBin());

export async function locateMultipassBin(): Promise<string> {
  try {
    return (await captureExec({
      cmd: ["which", "multipass.exe"],
    })).out.trim();
  } catch {
    try {
      return (await captureExec({
        cmd: ["which", "multipass"],
      })).out.trim();
    } catch {
      throw new Error("Error: multipass binary is not found");
    }
  }
}

export async function multipass(
  { command, args, stdout, stderr }: {
    command: string;
    args: string[];
    stdout?: StdOutputBehavior;
    stderr?: StdOutputBehavior;
  },
) {
  const cmd = [await multipassBin(), command, ...args];

  log("Executing", cyan(cmd.join(" ")));

  await inheritExec({ cmd, stdout, stderr });
}

export async function multipassCapture(
  { command, args, stderr, abortSignal }: {
    command: string;
    args: string[];
    stderr?: StdOutputBehavior;
    abortSignal?: AbortSignal;
  },
): Promise<string> {
  return (await captureExec({
    cmd: [await multipassBin(), command, ...args],
    stderr,
    abortSignal,
  })).out;
}

export async function multipassInfo(
  { name, ignoreStderr, timeoutMs = 3000 }: {
    name: string;
    ignoreStderr?: boolean;
    timeoutMs?: number;
  },
) {
  const maybeJson = await (async () => {
    const abortController = new AbortController();
    const timer = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    try {
      return await multipassCapture({
        command: "info",
        args: [name, "--format", "json"],
        stderr: ignoreStderr ? { ignore: true } : { inherit: true },
        abortSignal: abortController.signal,
      });
    } catch (e) {
      if (e instanceof ExecAbortedError) {
        throw new Error(
          `Timed out waiting for 'multipass info ...' command to respond after ${timeoutMs}ms. Perhaps the multipassd daemon hung?`,
          e,
        );
      } else if (e instanceof NonZeroExitError) {
        throw new Error(`Command 'multipass info ...' failed: ${e.output?.err}}`, e);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  })();

  const output = (() => {
    try {
      return JSON.parse(maybeJson);
    } catch (e) {
      throw new Error(`Failed parsing 'multipass info ...' output to JSON due to: ${e.toString()}. Got: ${maybeJson}`);
    }
  })();

  const result = validate(MultipassInfo, output);

  if (!result.isSuccess) {
    throw new Error(
      `Unexpected output from 'multipass info ...'. Errors:\n${
        result.errorsToString({ separator: "\n", dataVar: "  -" })
      }`,
    );
  }

  return result.value.info[name];
}

function multipassCreateSshCommand(
  { sshDirectoryPath, ip, timeoutSeconds }: { sshDirectoryPath: string; ip: string; timeoutSeconds?: number },
) {
  return [
    ...(timeoutSeconds !== undefined) ? ["timeout", String(timeoutSeconds)] : [],
    "ssh",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "LogLevel=ERROR",
    "-i",
    `${sshDirectoryPath}/id_ed25519`,
    `ubuntu@${ip}`,
  ];
}

export async function multipassSshInteractive({ cmd, sshDirectoryPath, ip }: {
  ip: string;
  sshDirectoryPath: string;
  cmd: string[];
}): Promise<number> {
  const execCmd = [
    ...multipassCreateSshCommand({ sshDirectoryPath, ip }),
    ...cmd,
  ];

  return (await new Deno.Command(execCmd[0], {
    args: execCmd.slice(1),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).output()).code;
}

export async function multipassInheritSsh(
  { cmd, sshDirectoryPath, ip, abortSignal, tag, stdin, timeoutSeconds }: {
    ip: string;
    sshDirectoryPath: string;
    cmd: string[];
    abortSignal?: AbortSignal;
    tag: string;
    stdin?: StdInputBehavior;
    timeoutSeconds?: number;
  },
): Promise<void> {
  return await inheritExec({
    cmd: [
      ...multipassCreateSshCommand({ sshDirectoryPath, ip, timeoutSeconds }),
      ...cmd,
    ],
    abortSignal: abortSignal,
    stdout: { read: printOutLines((line) => `${tag} ${line}`) },
    stderr: { read: printErrLines((line) => `${tag} ${line}`) },
    stdin,
  });
}

export async function multipassWaitForSshReady(
  { ip, abortSignal, sshDirectoryPath }: { ip: string; abortSignal: AbortSignal; sshDirectoryPath: string },
) {
  await print("Waiting for SSH to be ready ");
  const maxAttempts = 30;
  try {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await multipassCaptureSsh({ cmd: ["date"], ip, sshDirectoryPath, abortSignal, timeoutSeconds: 2 });
        return;
      } catch (e) {
        if (
          e instanceof NonZeroExitError && (
            e.exitCode === 124 || // Exit code of the 'timeout' command
            e.output?.err.includes("Operation timed out")
          )
        ) {
          await print(".");
          await delay(1000);
        } else {
          throw e;
        }
      }
    }
  } finally {
    await print("\n");
  }

  throw new Error(`Failed waiting for SSH after ${maxAttempts} attempts`);
}

export async function multipassCaptureSsh(
  { cmd, sshDirectoryPath, ip, abortSignal, stdin, timeoutSeconds }: {
    ip: string;
    sshDirectoryPath: string;
    cmd: string[];
    abortSignal?: AbortSignal;
    stdin?: StdInputBehavior;
    timeoutSeconds?: number;
  },
) {
  return await captureExec({
    cmd: [
      ...multipassCreateSshCommand({ sshDirectoryPath, ip, timeoutSeconds }),
      ...cmd,
    ],
    abortSignal: abortSignal,
    stderr: { capture: true },
    stdin,
  });
}

export async function multipassK3sKillAll(
  { ip, sshDirectoryPath }: { ip: string; sshDirectoryPath: string },
) {
  const tag = gray(`[$ k3s-killall.sh ]`);
  log(`Going to SSH and execute k3s-killall.sh`);

  await multipassInheritSsh({
    sshDirectoryPath,
    ip,
    cmd: ["bash", "-c", '"if which k3s-killall.sh; then k3s-killall.sh; fi"'],
    tag,
  });
}

export async function multipassSuspend({ name }: { name: string }) {
  await multipass({ command: "suspend", args: [name], stdout: { inherit: true }, stderr: { inherit: true } });
}

export async function multipassStop({ name }: { name: string }) {
  await multipass({ command: "stop", args: [name], stdout: { ignore: true } });
}

export async function multipassStart({ name }: { name: string }) {
  await multipass({
    command: "start",
    args: [name],
    stdout: { inherit: true },
    stderr: { inherit: true },
  });
}

export async function multipassDelete(name: string) {
  await multipass({ command: "delete", args: ["--purge", name] });
}

export async function multipassWaitForState(
  { isReady, instance, abortSignal, onAfterAttempt }: {
    isReady: (state: InstanceState) => boolean;
    instance: InstanceConfig;
    abortSignal: AbortSignal;
    onAfterAttempt?: (ready: boolean) => Promise<void>;
  },
): Promise<void> {
  while (!abortSignal.aborted) {
    const ready = await (async () => {
      try {
        const { state } = await multipassInfo({ name: instance.name, ignoreStderr: true, timeoutMs: 30_000 });

        return isReady(state);
      } catch (e) {
        if (e instanceof Error && e.cause instanceof ExecAbortedError) {
          throw e;
        }
        return false;
      }
    })();

    await onAfterAttempt?.(ready);
    if (!ready) {
      await delay(1000);
    } else {
      return;
    }
  }
}

export async function multipassTailCloudInitOutputLog(
  { instance, abortSignal }: {
    instance: InstanceConfig;
    abortSignal: AbortSignal;
  },
): Promise<void> {
  const tag = gray(`[$ cloud-init ]`);

  log();
  await print(tag, "Waiting for instance's 'Running' state ");

  await multipassWaitForState({
    isReady: (state) => state === InstanceState.Running,
    instance,
    abortSignal,
    async onAfterAttempt(ready) {
      await print(ready ? "\n" : ".");
    },
  });

  log(tag, "Obtaining instance's IP");
  const ip = await multipassWaitForExternalIp(instance, abortSignal);

  log(tag, "Got instance's IP", cyan(ip));

  await multipassInheritSsh({
    sshDirectoryPath: instance.sshDirectoryPath,
    ip,
    cmd: ["tail", "-F", "-n", "+1", "/var/log/cloud-init-output.log"],
    tag,
    abortSignal,
  });
}

export async function multipassWaitForExternalIp(
  { name, externalNetworkCidr }: InstanceConfig,
  abortSignal: AbortSignal,
): Promise<string> {
  if (externalNetworkCidr) {
    return await (async () => {
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        if (abortSignal.aborted) {
          throw abortSignal.reason;
        }

        let ipv4: string[] = [];

        try {
          ipv4 = (await multipassInfo({ name })).ipv4;
          return getExternalIp(ipv4, externalNetworkCidr);
        } catch (_) {
          log(
            "Waiting for the instance's IP that matches the CIDR filter:",
            externalNetworkCidr,
            "So far got:",
            ipv4.length > 0 ? ipv4.join(", ") : "none",
          );
          await delay(1000, { signal: abortSignal });
        }
      }

      throw new Error(`Failed obtaining instance IP after ${maxAttempts} attempts`);
    })();
  }

  return getExternalIp((await multipassInfo({ name })).ipv4);
}

export async function multipassPostStart(instance: InstanceConfig, abortSignal: AbortSignal): Promise<string> {
  const { name, sshDirectoryPath } = instance;

  const state = await (async () => {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return (await multipassInfo({ name })).state;
      } catch (e) {
        err("Failed obtaining instance state, will retry in 1s", e.message);
        await delay(1000, { signal: abortSignal });
      }
    }

    throw new Error(`Failed obtaining instance state after ${maxAttempts} attempts`);
  })();

  if (state !== InstanceState.Running) {
    throw new Error(
      `Instance '${instance.name}' is not in 'Running' state. Current state is '${state}'`,
    );
  }

  const ip = await multipassWaitForExternalIp(instance, abortSignal);

  assertExists(ip);

  ok("Got instance IP", cyan(ip));

  if (instance.role === "server" && instance.clusterInit) {
    const clusterIp = instance.keepalived?.virtualIp ?? ip;
    await multipassWaitForSshReady({ ip, abortSignal, sshDirectoryPath });
    await multipassResolveClusterLocalDns({ ip: clusterIp, instance, abortSignal });

    if (instance.joinMetadataPath) {
      log("Fetching join token from /var/lib/rancher/k3s/server/node-token over SSH");
      const joinToken = (await multipassCaptureSsh({
        cmd: ["sudo", "cat", "/var/lib/rancher/k3s/server/node-token"],
        sshDirectoryPath,
        ip,
      })).out;

      const joinMetadata: JoinMetadata = {
        url: `https://${instance.keepalived?.virtualIp ?? ip}:6443`,
        token: joinToken.trim(),
      };

      log("Writing join metadata to", cyan(instance.joinMetadataPath));
      await ensureFile(instance.joinMetadataPath);
      await Deno.writeTextFile(instance.joinMetadataPath, JSON.stringify(joinMetadata, null, 2));
    }

    await multipassUnroute({ instance });
    await multipassRoute({ ip: clusterIp, instance });
  }

  return ip;
}

export async function multipassResolveClusterLocalDns(
  {
    ip,
    abortSignal,
    instance: { sshDirectoryPath, clusterDnsIp, clusterDomain },
  }: {
    ip: string;
    instance: ServerInstanceConfig;
    abortSignal?: AbortSignal;
  },
) {
  log(`Adding DNS resolution for svc.${clusterDomain} to cni0 interface`);
  await print("Waiting for cni0 network interface to be created ");

  try {
    await (async () => {
      const maxAttempts = 30;
      for (let i = 0; i < maxAttempts; i++) {
        try {
          if (abortSignal?.aborted) {
            throw abortSignal.reason;
          }

          await multipassCaptureSsh({ cmd: ["ip", "link", "show", "cni0"], sshDirectoryPath, ip, abortSignal });
          return;
        } catch (e) {
          if (
            e instanceof NonZeroExitError &&
            e.output?.err.includes('Device "cni0" does not exist.')
          ) {
            await print(".");
            await delay(1000, { signal: abortSignal });
          } else {
            throw e;
          }
        }
      }

      throw new Error(`Failed waiting for cni0 after ${maxAttempts} attempts`);
    })();
  } finally {
    await print("\n");
  }

  await multipassInheritSsh({
    cmd: ["sudo", "resolvectl", "domain", "cni0", `~svc.${clusterDomain}`],
    sshDirectoryPath,
    ip,
    abortSignal,
    tag: gray("[ ssh ... resolvectl ... ]"),
  });

  await multipassInheritSsh({
    cmd: ["sudo", "resolvectl", "dns", "cni0", clusterDnsIp],
    sshDirectoryPath,
    ip,
    abortSignal,
    tag: gray("[ ssh ... resolvectl ... ]"),
  });
}

function wrapPowershellScript(script: string) {
  return `try { ${script}; if (-not $?) { exit 1 } } catch { Write-Host 'An error occurred:'; Write-Host $_; exit 1 }`;
}

export async function multipassUnroute(
  { instance: { clusterCidr, serviceCidr, clusterDomain } }: {
    instance: ServerInstanceConfig;
  },
) {
  const isWindows = (await multipassBin()).endsWith(".exe");

  if (isWindows) {
    log("Removing routes");
    for (const cidr of [clusterCidr, serviceCidr]) {
      const cmd = [
        "powershell.exe",
        "-Command",
        `Remove-NetRoute -DestinationPrefix ${cidr} -Confirm:$false -ErrorAction SilentlyContinue; exit 0`,
      ];
      await inheritExec({
        cmd,
        stdin: { inherit: true },
        stdout: { read: printOutLines((line) => `${gray("[$ Remove-NetRoute ]")} ${line}`) },
        stderr: { read: printErrLines((line) => `${gray("[$ Remove-NetRoute ]")} ${line}`) },
      });
    }

    log("Removing NRPT rule");
    await inheritExec({
      cmd: [
        "powershell.exe",
        "-Command",
        `Foreach($x in (Get-DnsClientNrptRule | Where-Object {$_.Namespace -eq ".svc.${clusterDomain}"} | foreach {$_.Name})){ Remove-DnsClientNrptRule -Name "$x" -Force }`,
      ],
      stdin: { inherit: true },
      stdout: { read: printOutLines((line) => `${gray("[$ Remove-DnsClientNrptRule ]")} ${line}`) },
      stderr: { read: printErrLines((line) => `${gray("[$ Remove-DnsClientNrptRule ]")} ${line}`) },
    });
  } else {
    log("Removing routes, will require root permissions...");
    for (const cidr of [clusterCidr, serviceCidr]) {
      try {
        await inheritExec({
          cmd: ["sudo", "/sbin/route", "delete", "-net", cidr],
          stdin: { inherit: true },
          stdout: { read: printOutLines((line) => `${gray("[$ route ]")} ${line}`) },
          stderr: { read: printErrLines((line) => `${gray("[$ route ]")} ${line}`) },
        });
      } catch {
        // Ignore
      }
    }

    try {
      await inheritExec({
        cmd: ["sudo", "rm", "-f", `/etc/resolver/svc.${clusterDomain}`],
        stdin: { inherit: true },
        stdout: { read: printOutLines((line) => `${gray("[$ resolver ]")} ${line}`) },
        stderr: { read: printErrLines((line) => `${gray("[$ resolver ]")} ${line}`) },
      });
    } catch {
      // Ignore
    }
  }
}

export async function multipassRoute(
  { ip, instance: { clusterCidr, serviceCidr, clusterDomain, clusterDnsIp } }: {
    ip: string;
    instance: ServerInstanceConfig;
  },
) {
  const isWindows = (await multipassBin()).endsWith(".exe");

  if (isWindows) {
    log("Adding routes");
    for (const cidr of [clusterCidr, serviceCidr]) {
      await inheritExec({
        cmd: [
          "powershell.exe",
          "-Command",
          wrapPowershellScript(
            `New-NetRoute -DestinationPrefix ${cidr} -InterfaceAlias "vEthernet (Default Switch)" -NextHop ${ip}`,
          ),
        ],
        stdin: { inherit: true },
        stdout: { read: printOutLines((line) => `${gray("[$ New-NetRoute ]")} ${line}`) },
        stderr: { read: printErrLines((line) => `${gray("[$ New-NetRoute ]")} ${line}`) },
      });
    }

    log("Adding NRPT rule");
    await inheritExec({
      cmd: [
        "powershell.exe",
        "-Command",
        wrapPowershellScript(
          `Add-DnsClientNrptRule -Namespace ".svc.${clusterDomain}" -DnsSecEnable -NameServers "${clusterDnsIp}"`,
        ),
      ],
      stdin: { inherit: true },
      stdout: { read: printOutLines((line) => `${gray("[$ Add-DnsClientNrptRule ]")} ${line}`) },
      stderr: { read: printErrLines((line) => `${gray("[$ Add-DnsClientNrptRule ]")} ${line}`) },
    });
  } else {
    log("Adding routes, will require root permissions...");
    for (const cidr of [clusterCidr, serviceCidr]) {
      await inheritExec({
        cmd: ["sudo", "/sbin/route", "add", "-net", cidr, ip],
        stdin: { inherit: true },
        stdout: { read: printOutLines((line) => `${gray("[$ route ]")} ${line}`) },
        stderr: { read: printErrLines((line) => `${gray("[$ route ]")} ${line}`) },
      });
    }

    await inheritExec({
      cmd: ["sudo", "mkdir", "-p", "/etc/resolver"],
      stdout: { read: printOutLines((line) => `${gray("[$ resolver ]")} ${line}`) },
      stderr: { read: printErrLines((line) => `${gray("[$ resolver ]")} ${line}`) },
    });

    await inheritExec({
      cmd: ["sudo", "tee", `/etc/resolver/svc.${clusterDomain}`],
      stdin: {
        pipe: [`domain svc.${clusterDomain}`, `nameserver ${clusterDnsIp}`, "search_order 1", ""].join("\n"),
      },
      stdout: { read: printOutLines((line) => `${gray("[$ resolver ]")} ${line}`) },
      stderr: { read: printErrLines((line) => `${gray("[$ resolver ]")} ${line}`) },
    });
  }
}
