import { Arr, Bool, Enum, Lit, NonEmpStr, Obj, Opt, PartObj, PosInt, Rec, Str, Uni } from "@wok/schema/schema";

export const Cidr = NonEmpStr({
  pattern: "^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))$",
});
export const Ipv4 = NonEmpStr({
  format: "ipv4",
});
export const Url = NonEmpStr({ format: "url" });

export const ServerInstanceConfigSchema = Obj({
  role: Lit("server"),
  name: NonEmpStr(),
  contextName: Opt(NonEmpStr()),
  image: Opt(NonEmpStr()),
  cpus: PosInt(),
  memoryGiBs: PosInt(),
  diskGiBs: PosInt(),
  bridged: Opt(Bool()),
  k3sVersion: NonEmpStr(),
  externalNetworkCidr: Opt(Cidr),
  datastoreEndpoint: Opt(NonEmpStr()),
  clusterCidr: Cidr,
  serviceCidr: Cidr,
  clusterDnsIp: Ipv4,
  clusterDomain: NonEmpStr({ format: "hostname" }),
  kubelet: Opt(Obj({
    maxPods: Opt(PosInt()),
  })),
  disableComponents: Opt(Obj({
    coredns: Opt(Bool()),
    servicelb: Opt(Bool()),
    traefik: Opt(Bool()),
    localStorage: Opt(Bool()),
    metricsServer: Opt(Bool()),
  })),
  nodeLabels: Opt(Rec(NonEmpStr(), NonEmpStr())),
  nodeTaints: Opt(Rec(NonEmpStr(), NonEmpStr())),
  sshDirectoryPath: NonEmpStr(),
  joinMetadataPath: NonEmpStr(),
  userName: Opt(NonEmpStr()),
  userPassword: Opt(NonEmpStr()),
  clusterInit: Opt(Bool()),
  keepalived: Opt(Obj({
    state: Uni([Lit("MASTER"), Lit("BACKUP")]),
    virtualRouterId: PosInt(),
    virtualIp: Ipv4,
    priority: PosInt(),
    password: NonEmpStr(),
  })),
});

export const AgentInstanceConfigSchema = Obj({
  role: Lit("agent"),
  name: NonEmpStr(),
  image: Opt(NonEmpStr()),
  cpus: PosInt(),
  memoryGiBs: PosInt(),
  diskGiBs: PosInt(),
  bridged: Opt(Bool()),
  clusterDomain: NonEmpStr({ format: "hostname" }),
  kubelet: Opt(Obj({
    maxPods: PosInt(),
  })),
  externalNetworkCidr: Opt(Cidr),
  k3sVersion: NonEmpStr(),
  nodeLabels: Opt(Rec(NonEmpStr(), NonEmpStr())),
  nodeTaints: Opt(Rec(NonEmpStr(), NonEmpStr())),
  sshDirectoryPath: NonEmpStr(),
  joinMetadataPath: NonEmpStr(),
  userName: Opt(NonEmpStr()),
  userPassword: Opt(NonEmpStr()),
});

export const ClusterInstanceConfigSchema = Obj({
  servers: Arr(ServerInstanceConfigSchema),
  agents: Arr(AgentInstanceConfigSchema),
});

export const InstanceConfigSchema = Uni([
  ServerInstanceConfigSchema,
  AgentInstanceConfigSchema,
]);

export const JoinMetadataSchema = Obj({
  url: NonEmpStr({ format: "uri" }),
  token: NonEmpStr(),
});

export type JoinMetadata = typeof JoinMetadataSchema.infer;

export enum InstanceState {
  Starting = "Starting",
  Running = "Running",
  Stopped = "Stopped",
  Suspended = "Suspended",
  Unknown = "Unknown",
}

export const MultipassInfo = PartObj({
  info: Rec(
    NonEmpStr(),
    PartObj({
      ipv4: Arr(Ipv4),
      state: Enum(Object.values(InstanceState)),
    }),
  ),
});

export type ServerInstanceConfig = typeof ServerInstanceConfigSchema.infer;
export type AgentInstanceConfig = typeof AgentInstanceConfigSchema.infer;
export type InstanceConfig = typeof InstanceConfigSchema.infer;

export const InstanceConfigPathSchema = Str({
  minLength: 1,
  description: "Path to the instance config file. It should be an ES module with a default export.",
});
