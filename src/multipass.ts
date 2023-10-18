import {
  assertExists,
  captureExec,
  cyan,
  delay,
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
import { InstanceConfig, InstanceState, MultipassInfo } from "./types.ts";
import { getSshIp, log, ok, print } from "./utils.ts";

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
        );
      } else if (e instanceof NonZeroExitError) {
        throw new Error(`Command 'multipass info ...' failed`);
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
  { sshDirectoryPath, ip }: { sshDirectoryPath: string; ip: string },
) {
  return [
    "ssh",
    "-o",
    "UserKnownHostsFile=/dev/null",
    "-o",
    "StrictHostKeyChecking=no",
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
  { cmd, sshDirectoryPath, ip, abortSignal, tag, stdin }: {
    ip: string;
    sshDirectoryPath: string;
    cmd: string[];
    abortSignal?: AbortSignal;
    tag: string;
    stdin?: StdInputBehavior;
  },
): Promise<void> {
  return await inheritExec({
    cmd: [
      ...multipassCreateSshCommand({ sshDirectoryPath, ip }),
      ...cmd,
    ],
    abortSignal: abortSignal,
    stdout: { read: printOutLines((line) => `${tag} ${line}`) },
    stderr: { read: printErrLines((line) => `${tag} ${line}`) },
    stdin,
  });
}

export async function multipassCaptureSsh(
  { cmd, sshDirectoryPath, ip, abortSignal, stdin }: {
    ip: string;
    sshDirectoryPath: string;
    cmd: string[];
    abortSignal?: AbortSignal;
    stdin?: StdInputBehavior;
  },
) {
  return await captureExec({
    cmd: [
      ...multipassCreateSshCommand({ sshDirectoryPath, ip }),
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
  log("Going to SSH and execute k3s-killall.sh");

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
  await multipass({ command: "delete", args: [name] });
  await multipass({ command: "purge", args: [] });
}

export async function multipassWaitForState(
  { isReady, instance, abortSignal }: {
    isReady: (state: InstanceState) => boolean;
    instance: InstanceConfig;
    abortSignal: AbortSignal;
  },
): Promise<void> {
  while (!abortSignal.aborted) {
    const ready = await (async () => {
      try {
        const { state } = await multipassInfo({ name: instance.name, ignoreStderr: true });

        return isReady(state);
      } catch {
        return false;
      }
    })();

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
  log(tag, "Waiting for instance's 'Running' state");

  await multipassWaitForState({ isReady: (state) => state === InstanceState.Running, instance, abortSignal });

  log(tag, "Obtaining instance's IP");
  const { ipv4 } = await multipassInfo({ name: instance.name, ignoreStderr: true });

  const ip = getSshIp(ipv4, instance.filterSshIpByCidr);

  if (!ip) {
    return;
  }

  log(tag, "Got instance's IP", cyan(ip));

  await multipassInheritSsh({
    sshDirectoryPath: instance.sshDirectoryPath,
    ip,
    cmd: ["tail", "-F", "-n", "+1", "/var/log/cloud-init-output.log"],
    tag,
    abortSignal,
  });
}

export async function multipassPostStart(
  instance: InstanceConfig,
): Promise<string> {
  const { name, sshDirectoryPath } = instance;
  const { state } = await multipassInfo({ name });

  if (state !== InstanceState.Running) {
    throw new Error(
      `Instance '${instance.name}' is not in 'Running' state. Current state is '${state}'`,
    );
  }

  let ip: string | undefined = undefined;

  if (instance.filterSshIpByCidr) {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      let ipv4: string[] = [];

      try {
        ipv4 = (await multipassInfo({ name })).ipv4;
        ip = getSshIp(ipv4, instance.filterSshIpByCidr);
      } catch (e) {
        if (i === maxAttempts - 1) {
          throw e;
        }

        log(
          "Waiting for the instance's IP that matches the CIDR filter:",
          instance.filterSshIpByCidr,
          "So far got:",
          ipv4.length > 0 ? ipv4.join(", ") : "none",
        );
        await delay(1000);
      }
    }
  } else {
    ip = getSshIp((await multipassInfo({ name })).ipv4);
  }

  assertExists(ip);

  ok("Got instance IP", ip);

  await multipassResolveClusterLocalDns({ ip, instance });

  if (instance.nodeLabels) {
    const nodeLabels = Object.entries(instance.nodeLabels).map(([key, value]) => `${key}=${value}`);

    log("Adding labels to node:", ...nodeLabels.map((l) => cyan(l)));
    await multipassInheritSsh({
      ip,
      sshDirectoryPath,
      cmd: ["kubectl", "label", "node", name, "--overwrite", ...nodeLabels],
      tag: gray("[$ kubectl ]"),
    });
  }

  await multipassRoute({ ip, instance });

  return ip;
}

export async function multipassResolveClusterLocalDns(
  {
    ip,
    abortSignal,
    instance: { sshDirectoryPath, clusterDnsIp, clusterDomain },
  }: {
    ip: string;
    instance: InstanceConfig;
    abortSignal?: AbortSignal;
  },
) {
  log(`Adding DNS resolution for svc.${clusterDomain} to cni0 interface`);
  await print("Waiting for cni0 network interface to be created...");

  try {
    while (!abortSignal?.aborted) {
      try {
        await multipassCaptureSsh({ cmd: ["ip", "link", "show", "cni0"], sshDirectoryPath, ip, abortSignal });
        break;
      } catch (e) {
        if (
          e instanceof NonZeroExitError &&
          e.output?.err.includes('Device "cni0" does not exist.')
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

export async function multipassUnroute(
  { ip, instance: { clusterCidr, serviceCidr, clusterDomain } }: {
    ip: string;
    instance: InstanceConfig;
  },
) {
  const isWindows = (await multipassBin()).endsWith(".exe");

  if (isWindows) {
    log("Removing routes");
    for (const cidr of [clusterCidr, serviceCidr]) {
      const cmd = [
        "powershell.exe",
        `'Remove-NetRoute -DestinationPrefix ${cidr} -Confirm:$false -erroraction "silentlycontinue"'`,
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
          cmd: ["sudo", "/sbin/route", "delete", "-net", cidr, ip],
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
    instance: InstanceConfig;
  },
) {
  const isWindows = (await multipassBin()).endsWith(".exe");

  if (isWindows) {
    log("Adding routes");
    for (const cidr of [clusterCidr, serviceCidr]) {
      await inheritExec({
        cmd: [
          "powershell.exe",
          `'New-NetRoute -DestinationPrefix ${cidr} -InterfaceAlias "vEthernet (Default Switch)" -NextHop ${ip}'`,
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
        `'Add-DnsClientNrptRule -Namespace ".svc.${clusterDomain}" -DnsSecEnable -NameServers "${clusterDnsIp}"'`,
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
