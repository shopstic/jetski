import { dirname, green, printErrLines, printOutLines, resolvePath, validate } from "./deps.ts";
import { fsExists, gray, inheritExec, joinPath, red, stringifyYaml } from "./deps.ts";
import { InstanceConfig, InstanceConfigSchema, JoinMetadataSchema } from "./types.ts";
import cloudInitScripts from "./cloud_init_scripts.json" with { type: "json" };

export function stripMargin(template: TemplateStringsArray, ...expressions: unknown[]) {
  const result = template.reduce((accumulator, part, i) => {
    return accumulator + expressions[i - 1] + part;
  });

  return result.replace(/(\n|\r|\r\n)\s*\|/g, "$1");
}

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
  const joinMetadataPath = config.joinMetadataPath !== undefined
    ? resolvePath(
      dirname(instancePath),
      config.joinMetadataPath,
    )
    : undefined;

  return {
    ...config,
    sshDirectoryPath,
    joinMetadataPath: joinMetadataPath!,
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

export async function createCloudInitConfig(
  {
    sshPublicKey,
    instance,
  }: {
    sshPublicKey: string;
    instance: InstanceConfig;
  },
) {
  const joinMetadata = await (async () => {
    try {
      if (instance.role === "agent" || (instance.role === "server" && !instance.clusterInit)) {
        const content = JSON.parse(await Deno.readTextFile(instance.joinMetadataPath));
        const result = validate(JoinMetadataSchema, content);

        if (!result.isSuccess) {
          throw new Error(
            "Failed parsing metadata due to schema validation errors:\n" + result.errorsToString({
              separator: "\n",
              dataVar: "  -",
            }),
          );
        }

        return result.value;
      }
    } catch (e) {
      throw new Error(`Failed reading join metadata from ${instance.joinMetadataPath}. Reason: ${e.message}`, e);
    }
  })();

  const {
    userName = "ubuntu",
    userPassword,
    kubelet,
    nodeLabels,
    nodeTaints,
    clusterDomain,
    k3sVersion,
  } = instance;

  let k3sConfig: Record<string, unknown>;

  const nodeLabelsConfigValue = Object.entries(nodeLabels ?? {}).map(([key, value]) => `${key}=${value}`);
  const nodeTaintsConfigValue = Object.entries(nodeTaints ?? {}).map(([key, value]) => `${key}=${value}`);

  if (instance.role === "server") {
    const {
      clusterCidr,
      serviceCidr,
      clusterDnsIp,
      clusterDomain,
      disableComponents,
      datastoreEndpoint,
    } = instance;

    const k3sConfigDisable = [
      ...(disableComponents?.coredns ? ["coredns"] : []),
      ...(disableComponents?.localStorage ? ["local-storage"] : []),
      ...(disableComponents?.metricsServer ? ["metrics-server"] : []),
      ...(disableComponents?.servicelb ? ["servicelb"] : []),
      ...(disableComponents?.traefik ? ["traefik"] : []),
    ];

    k3sConfig = {
      "write-kubeconfig-mode": "0644",
      "cluster-cidr": clusterCidr,
      "service-cidr": serviceCidr,
      "cluster-dns": clusterDnsIp,
      "cluster-domain": clusterDomain,
      "disable": k3sConfigDisable,
      "node-label": nodeLabelsConfigValue,
      "node-taint": nodeTaintsConfigValue,
      ...(datastoreEndpoint ? { "datastore-endpoint": datastoreEndpoint } : {}),
    };
  } else {
    k3sConfig = {
      "node-label": nodeLabelsConfigValue,
      "node-taint": nodeTaintsConfigValue,
    };
  }

  let k3sCommand: string;

  if (instance.role === "agent") {
    k3sCommand = [
      joinMetadata ? `K3S_TOKEN=${JSON.stringify(joinMetadata.token)} K3S_URL=${JSON.stringify(joinMetadata.url)}` : "",
      `sh -s - agent --node-ip="$(cat /etc/node-external-ip)" --flannel-iface="$(cat /etc/node-external-iface)"`,
    ].join(" ");
  } else {
    k3sCommand = [
      joinMetadata ? `K3S_TOKEN=${JSON.stringify(joinMetadata.token)}` : "",
      "sh -s - server",
      instance.clusterInit
        ? `--cluster-init --tls-san="${
          instance.keepalived ? instance.keepalived.virtualIp : "$(cat /etc/node-external-ip)"
        }"`
        : "",
      joinMetadata ? `--server=${JSON.stringify(joinMetadata.url)}` : "",
      `--node-ip="$(cat /etc/node-external-ip)" --flannel-iface="$(cat /etc/node-external-iface)"`,
    ].join(" ");
  }

  return {
    users: [
      "default",
      {
        name: userName,
        sudo: "ALL=(ALL) NOPASSWD:ALL",
        groups: ["users", "admin", "sudo"],
        shell: "/bin/bash",
        ssh_import_id: "None",
        lock_passwd: userPassword === undefined,
        ssh_authorized_keys: [sshPublicKey],
      },
    ],
    system_info: {
      default_user: {
        name: userName,
        home: `/home/${userName}`,
      },
    },
    ...(userPassword !== undefined)
      ? {
        password: userPassword,
        chpasswd: {
          expire: false,
        },
      }
      : {},
    write_files: [
      {
        owner: "root:root",
        path: "/etc/rancher/k3s/config.yaml",
        content: stringifyYaml(k3sConfig),
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
            ...kubelet,
          }),
        }]
        : []),
      ...Object.entries(cloudInitScripts).map(([name, content]) => ({
        owner: "root:root",
        path: `/usr/bin/${name}`,
        permissions: "0755",
        content,
      })),
      ...(instance.role === "server" && instance.keepalived
        ? [{
          owner: "root:root",
          path: "/usr/bin/setup_keepalived.sh",
          permissions: "0755",
          content: stripMargin`#!/usr/bin/env bash
            |set -euo pipefail
            |iface=$(cat /etc/node-external-iface) || exit $?
            |apt install -y keepalived
            |
            |cat >/etc/keepalived/keepalived.conf <<EOF
            |global_defs {
            |  vrrp_startup_delay 15  
            |}
            |vrrp_instance VI_1 {
            |  state ${instance.keepalived.state}
            |  ${instance.keepalived.state === "BACKUP" ? "nopreempt" : ""}
            |  interface $iface
            |  virtual_router_id ${instance.keepalived.virtualRouterId}
            |  priority ${instance.keepalived.priority}
            |  advert_int 1
            |  authentication {
            |    auth_type PASS
            |    auth_pass ${instance.keepalived.password}
            |  }
            |  virtual_ipaddress {
            |    ${instance.keepalived.virtualIp}/24
            |  }
            |}
            |EOF
            |
            |systemctl enable --now keepalived
            `,
        }]
        : []),
    ],
    runcmd: [
      "sysctl -p /etc/sysctl.d/98-inotify.conf",
      "/usr/bin/install_chrony.sh",
      "/usr/bin/pin_ip_addresses.sh",
      "/usr/bin/override_k3s_service.sh",
      ...(instance.role === "server" && instance.keepalived ? ["/usr/bin/setup_keepalived.sh"] : []),
      `curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=${k3sVersion} INSTALL_K3S_EXEC="${
        [
          kubelet ? "--kubelet-arg=config=/etc/rancher/k3s/kubelet-config.yaml" : "",
        ].join(" ")
      }" ${k3sCommand}`,
    ],
    package_update: false,
  };
}

export async function print(...params: string[]) {
  await Deno.stdout.write(new TextEncoder().encode(params.join(" ")));
}

export function log(...params: unknown[]) {
  console.error.apply(console, params);
}

export function out(...params: unknown[]) {
  console.log.apply(console, params);
}

export function ok(...params: unknown[]) {
  console.error.apply(console, [green("[Success]"), ...params]);
}

export function err(...params: unknown[]) {
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

export function getExternalIp(ipv4s: string[], filterByCidr?: string) {
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
