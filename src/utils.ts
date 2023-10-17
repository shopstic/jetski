import { dirname, green, printErrLines, printOutLines, resolvePath, validate } from "./deps.ts";
import { fsExists, gray, inheritExec, joinPath, red, stringifyYaml } from "./deps.ts";
import { InstanceConfig, InstanceConfigSchema } from "./types.ts";

export async function loadInstanceConfig(
  instancePath: string,
): Promise<InstanceConfig> {
  log(gray(`Importing instance config ${instancePath}`));

  const instanceMod = await import(instancePath);

  if (!instanceMod.default) {
    throw new Error("Instance config module does not have a default export");
  }

  const instanceResult = validate(InstanceConfigSchema, instanceMod.default);

  if (!instanceResult.isSuccess) {
    throw new Error(
      `Instance config is invalid. Reasons:\n${
        instanceResult.errorsToString({
          separator: "\n",
          dataVar: "  -",
        })
      }`,
    );
  }

  const config = instanceResult.value;
  const sshDirectoryPath = resolvePath(
    dirname(instancePath),
    config.sshDirectoryPath,
  );

  return {
    ...config,
    sshDirectoryPath,
  };
}

export async function getSshPublicKey(
  sshDirectoryPath: string,
): Promise<string> {
  const publicKeyPath = joinPath(sshDirectoryPath, "id_ed25519.pub");
  return await Deno.readTextFile(publicKeyPath);
}

export async function generateSshKeyPairIfNotExists(
  { name, sshDirectoryPath }: InstanceConfig,
): Promise<void> {
  try {
    await Deno.mkdir(sshDirectoryPath, {
      mode: 0o700,
      recursive: true,
    });
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) {
      throw e;
    }
  }

  const privateKeyPath = joinPath(sshDirectoryPath, "id_ed25519");

  if (!(await fsExists(privateKeyPath))) {
    log(
      `Generating a new SSH key pair for instance '${name}' to`,
      sshDirectoryPath,
    );
    const tag = gray(`[$ ssh-keygen ...]`);
    await inheritExec({
      cmd: ["ssh-keygen", "-t", "ed25519", "-C", name, "-f", privateKeyPath, "-P", ""],
      stderr: { read: printErrLines((line) => `${tag} ${line}`) },
      stdout: { read: printOutLines((line) => `${tag} ${line}`) },
    });
  } else {
    log(
      `Reusing the SSH key pair for instance '${name}' from`,
      sshDirectoryPath,
    );
  }
}

export function createCloudInitConfig(
  {
    sshPublicKey,
    instance: {
      clusterCidr,
      serviceCidr,
      clusterDnsIp,
      clusterDomain,
      k3sVersion,
      disableComponents,
      datastoreEndpoint,
      kubelet,
    },
  }: {
    sshPublicKey: string;
    instance: InstanceConfig;
  },
) {
  const k3sConfigDisable = [
    ...(disableComponents?.coredns ? ["coredns"] : []),
    ...(disableComponents?.localStorage ? ["local-storage"] : []),
    ...(disableComponents?.metricsServer ? ["metrics-server"] : []),
    ...(disableComponents?.servicelb ? ["servicelb"] : []),
    ...(disableComponents?.traefik ? ["traefik"] : []),
  ];

  return {
    users: [
      "default",
      {
        name: "ubuntu",
        gecos: "Ubuntu",
        sudo: "ALL=(ALL) NOPASSWD:ALL",
        groups: "users, admin",
        shell: "/bin/bash",
        ssh_import_id: "None",
        lock_passwd: true,
        ssh_authorized_keys: [sshPublicKey],
      },
    ],
    write_files: [
      {
        owner: "root:root",
        path: "/etc/rancher/k3s/config.yaml",
        content: stringifyYaml({
          "write-kubeconfig-mode": "0644",
          "cluster-cidr": clusterCidr,
          "service-cidr": serviceCidr,
          "cluster-dns": clusterDnsIp,
          "cluster-domain": clusterDomain,
          "disable": k3sConfigDisable,
          ...(datastoreEndpoint
            ? {
              "datastore-endpoint": datastoreEndpoint,
            }
            : {}),
        }),
      },
      {
        owner: "root:root",
        path: "/etc/sysctl.d/98-inotify.conf",
        content: [
          "fs.inotify.max_user_watches = 122425",
          "fs.inotify.max_user_instances = 122425",
          "",
        ].join("\n"),
      },
      {
        owner: "root:root",
        path: "/etc/rancher/k3s/registries.yaml",
        content: stringifyYaml({
          mirrors: {
            [`docker-registry.registry.svc.${clusterDomain}`]: {
              endpoint: [
                `http://docker-registry.registry.svc.${clusterDomain}`,
              ],
            },
          },
        }),
      },
      ...(kubelet
        ? [{
          owner: "root:root",
          path: "/etc/rancher/k3s/kubelet-config.yaml",
          content: stringifyYaml({
            apiVersion: "kubelet.config.k8s.io/v1beta1",
            kind: "KubeletConfiguration",
            maxPods: kubelet.maxPods,
          }),
        }]
        : []),
    ],
    runcmd: [
      "sysctl -p /etc/sysctl.d/98-inotify.conf",
      `curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${k3sVersion} ${
        kubelet ? 'INSTALL_K3S_EXEC="--kubelet-arg=config=/etc/rancher/k3s/kubelet-config.yaml"' : ""
      } sh -`,
    ],
    package_update: false,
  };
}

export async function print(...params: string[]) {
  await ReadableStream.from([new TextEncoder().encode(params.join(" "))]).pipeTo(Deno.stdout.writable, {
    preventClose: true,
  });
}

export function log(...params: string[]) {
  console.error.apply(console, params);
}

export function out(...params: string[]) {
  console.log.apply(console, params);
}

export function ok(...params: string[]) {
  console.error.apply(console, [green("[Success]"), ...params]);
}

export function err(...params: string[]) {
  console.error.apply(console, [red("[Error]"), ...params]);
}

const ipv4ToBinary = (ipv4: string) =>
  ipv4.split(".").map((octet) => parseInt(octet, 10).toString(2).padStart(8, "0"))
    .join("");

export const isIpv4InCidr = (
  cidrv4: string,
  ipv4: string,
  { isNetwork, isBroadcast } = { isNetwork: false, isBroadcast: false },
) => {
  const [networkRange, bits] = cidrv4.split("/");
  const IPv4Binary = ipv4ToBinary(ipv4),
    rangeBinary = ipv4ToBinary(networkRange);

  for (let i = 0; i < +bits; i++) {
    if (IPv4Binary.charAt(i) !== rangeBinary.charAt(i)) {
      return false;
    }
  }

  if (isNetwork && +bits < 31) {
    const networkAdressBinary = rangeBinary.substring(0, +bits).padEnd(32, "0");
    if (networkAdressBinary === IPv4Binary) return true;
  }

  if (isBroadcast && +bits < 31) {
    const broadcastAddressBinary = rangeBinary.substring(0, +bits).padEnd(
      32,
      "1",
    );
    if (broadcastAddressBinary === IPv4Binary) return true;
  }

  if (!(isNetwork && isBroadcast)) return true;

  return false;
};

export function getSshIp(ipv4s: string[], filterByCidr?: string) {
  if (!filterByCidr) {
    return ipv4s[0];
  }

  const found = ipv4s.find((ipv4) => isIpv4InCidr(filterByCidr, ipv4));

  if (!found) {
    throw new Error(
      `No SSH IP address found that matches the CIDR filter: ${filterByCidr}. All available IPs are: ${
        ipv4s.join(", ")
      }`,
    );
  }

  return found;
}
