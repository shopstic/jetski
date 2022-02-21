import { Static, Type } from "./deps.ts";

export const NonEmptyString = Type.String({ minLength: 1 });
export const Cidr = Type.String({
  format: "regex",
  pattern: "^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))$",
});
export const Ipv4 = Type.String({
  format: "ipv4",
});

export const InstanceConfigSchema = Type.Object({
  name: NonEmptyString,
  image: Type.Optional(NonEmptyString),
  cpus: Type.Number(),
  memoryGiBs: Type.Number(),
  diskGiBs: Type.Number(),
  k3sVersion: NonEmptyString,
  clusterCidr: Cidr,
  serviceCidr: Cidr,
  clusterDnsIp: Ipv4,
  clusterDomain: Type.String({ format: "hostname", minLength: 1 }),
  disableComponents: Type.Optional(Type.Object({
    coredns: Type.Optional(Type.Boolean()),
    servicelb: Type.Optional(Type.Boolean()),
    traefik: Type.Optional(Type.Boolean()),
    localStorage: Type.Optional(Type.Boolean()),
    metricsServer: Type.Optional(Type.Boolean()),
  })),
  nodeLabels: Type.Optional(Type.Record(Type.String(), Type.String())),
  sshDirectoryPath: NonEmptyString,
});

export enum InstanceState {
  Starting = "Starting",
  Running = "Running",
  Stopped = "Stopped",
  Unknown = "Unknown",
}

export const MultipassInfo = Type.PartialObject({
  info: Type.Record(
    Type.String(),
    Type.PartialObject({
      ipv4: Type.Array(Ipv4),
      state: Type.Enum(InstanceState),
    }),
  ),
});

export type InstanceConfig = Static<typeof InstanceConfigSchema>;

export const InstanceConfigPathSchema = Type.String({
  minLength: 1,
  description: "Path to the instance config file. It should be an ES module with a default export.",
});
