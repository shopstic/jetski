import { ServerInstanceConfig } from "../../src/types.ts";

export default {
  role: "server",
  name: "jetski-single-node",
  image: "22.04",
  cpus: 15,
  memoryGiBs: 56,
  diskGiBs: 200,
  k3sVersion: "v1.24.17+k3s1",
  clusterCidr: "10.254.254.0/24",
  serviceCidr: "10.254.255.0/24",
  clusterDnsIp: "10.254.255.10",
  clusterDomain: "cluster.local",
  bridged: Boolean(Deno.env.get("JETSKI_INSTANCE_BRIDGED")),
  externalNetworkCidr: Deno.env.get("JETSKI_INSTANCE_NODE_IP_CIDR"),
  disableComponents: {
    traefik: true,
    metricsServer: true,
  },
  nodeLabels: {
    "com.jetski/foo": "bar",
    "com.jetski/baz": "boo",
  },
  sshDirectoryPath: "./.ssh",
  // datastoreEndpoint: "http://192.168.2.22:2379"
  kubelet: {
    maxPods: 500,
  },
} satisfies ServerInstanceConfig;
