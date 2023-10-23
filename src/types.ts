import { PosInt } from "./deps.ts";
import { FlexObject, NonEmptyString, Static, Type } from "./deps/typebox.ts";

export const Cidr = NonEmptyString({
  format: "regex",
  pattern: "^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))$",
});
export const Ipv4 = NonEmptyString({
  format: "ipv4",
});
export const Url = NonEmptyString({ format: "url" });

export const ServerInstanceConfigSchema = Type.Object({
  role: Type.Literal("server"),
  name: NonEmptyString(),
  contextName: Type.Optional(NonEmptyString()),
  image: Type.Optional(NonEmptyString()),
  cpus: PosInt(),
  memoryGiBs: PosInt(),
  diskGiBs: PosInt(),
  bridged: Type.Optional(Type.Boolean()),
  k3sVersion: NonEmptyString(),
  externalNetworkCidr: Type.Optional(Cidr),
  externalNetworkInterface: Type.Optional(NonEmptyString()),
  datastoreEndpoint: Type.Optional(NonEmptyString()),
  clusterCidr: Cidr,
  serviceCidr: Cidr,
  clusterDnsIp: Ipv4,
  clusterDomain: NonEmptyString({ format: "hostname" }),
  kubelet: Type.Optional(Type.Object({
    maxPods: PosInt(),
  })),
  disableComponents: Type.Optional(Type.Object({
    coredns: Type.Optional(Type.Boolean()),
    servicelb: Type.Optional(Type.Boolean()),
    traefik: Type.Optional(Type.Boolean()),
    localStorage: Type.Optional(Type.Boolean()),
    metricsServer: Type.Optional(Type.Boolean()),
  })),
  nodeLabels: Type.Optional(Type.Record(NonEmptyString(), NonEmptyString())),
  nodeTaints: Type.Optional(Type.Record(NonEmptyString(), NonEmptyString())),
  sshDirectoryPath: NonEmptyString(),
  joinMetadataPath: Type.Optional(NonEmptyString()),
  userName: Type.Optional(NonEmptyString()),
  userPassword: Type.Optional(NonEmptyString()),
});

export const AgentInstanceConfigSchema = Type.Object({
  role: Type.Literal("agent"),
  name: NonEmptyString(),
  image: Type.Optional(NonEmptyString()),
  cpus: PosInt(),
  memoryGiBs: PosInt(),
  diskGiBs: PosInt(),
  bridged: Type.Optional(Type.Boolean()),
  clusterDomain: NonEmptyString({ format: "hostname" }),
  kubelet: Type.Optional(Type.Object({
    maxPods: PosInt(),
  })),
  externalNetworkCidr: Type.Optional(Cidr),
  externalNetworkInterface: Type.Optional(NonEmptyString()),
  k3sVersion: NonEmptyString(),
  nodeLabels: Type.Optional(Type.Record(NonEmptyString(), NonEmptyString())),
  nodeTaints: Type.Optional(Type.Record(NonEmptyString(), NonEmptyString())),
  sshDirectoryPath: NonEmptyString(),
  joinMetadataPath: NonEmptyString(),
  userName: Type.Optional(NonEmptyString()),
  userPassword: Type.Optional(NonEmptyString()),
});

export const InstanceConfigSchema = Type.Union([
  ServerInstanceConfigSchema,
  AgentInstanceConfigSchema,
]);

export const JoinMetadataSchema = Type.Object({
  url: NonEmptyString({ format: "uri" }),
  token: NonEmptyString(),
});

export type JoinMetadata = Static<typeof JoinMetadataSchema>;

export enum InstanceState {
  Starting = "Starting",
  Running = "Running",
  Stopped = "Stopped",
  Suspended = "Suspended",
  Unknown = "Unknown",
}

export const MultipassInfo = FlexObject({
  info: Type.Record(
    NonEmptyString(),
    FlexObject({
      ipv4: Type.Array(Ipv4),
      state: Type.Enum(InstanceState),
    }),
  ),
});

export type ServerInstanceConfig = Static<typeof ServerInstanceConfigSchema>;
export type AgentInstanceConfig = Static<typeof AgentInstanceConfigSchema>;
export type InstanceConfig = Static<typeof InstanceConfigSchema>;

export const InstanceConfigPathSchema = Type.String({
  minLength: 1,
  description: "Path to the instance config file. It should be an ES module with a default export.",
});
