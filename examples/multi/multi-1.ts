import { ServerInstanceConfig } from "../../src/types.ts";

export default {
  role: "server",
  name: "jetski-multi-node-1",
  contextName: "jetski-multi",
  image: "22.04",
  cpus: 15,
  memoryGiBs: 56,
  diskGiBs: 200,
  k3sVersion: "v1.24.17+k3s1",
  serviceCidr: "10.254.244.0/22",
  clusterCidr: "10.254.248.0/21",
  clusterDnsIp: "10.254.244.10",
  clusterDomain: "cluster.local",
  bridged: Boolean(Deno.env.get("JETSKI_INSTANCE_BRIDGED")),
  externalNetworkCidr: Deno.env.get("JETSKI_INSTANCE_NODE_IP_CIDR"),
  externalNetworkInterface: "eth1",
  disableComponents: {
    traefik: true,
    metricsServer: true,
  },
  nodeLabels: {
    "com.jetski/foo": "bar",
    "com.jetski/baz": "boo",
  },
  // datastoreEndpoint: "http://192.168.2.22:2379"
  kubelet: {
    maxPods: 500,
  },
  sshDirectoryPath: "./.secrets/.ssh",
  joinMetadataPath: "./.secrets/join.json",
} satisfies ServerInstanceConfig;
