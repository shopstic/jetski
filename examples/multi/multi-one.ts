import { ServerInstanceConfig } from "../../src/types.ts";

export default {
  name: "jetski-multi-node-one",
  image: "22.04",
  cpus: 1,
  memoryGiBs: 2,
  diskGiBs: 5,
  k3sVersion: "v1.24.17+k3s1",
  serviceCidr: "10.254.251.0/24",
  clusterCidr: "10.254.252.0/22",
  clusterDnsIp: "10.254.255.10",
  clusterDomain: "jetski.local",
  bridged: Boolean(Deno.env.get("JETSKI_INSTANCE_BRIDGED")),
  externalNetworkCidr: Deno.env.get("JETSKI_INSTANCE_NODE_IP_CIDR"),
  externalNetworkInterface: "eth1",
  disableComponents: {
    traefik: true,
    metricsServer: true
  },
  nodeLabels: {
    "com.jetski/foo": "bar",
    "com.jetski/baz": "boo",
  },
  // datastoreEndpoint: "http://192.168.2.22:2379"
  kubelet: {
    maxPods: 500
  },
  isBootstrapInstance: true,
  sshDirectoryPath: "./.secrets/.ssh",
  joinMetadataPath: "./.secrets/join.json",
} satisfies ServerInstanceConfig;
