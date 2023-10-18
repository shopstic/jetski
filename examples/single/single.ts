import { ServerInstanceConfig } from "../../src/types.ts";

export default {
  name: "jetski-single-node",
  image: "22.04",
  cpus: 1,
  memoryGiBs: 2,
  diskGiBs: 5,
  k3sVersion: "v1.24.17+k3s1",
  clusterCidr: "10.254.254.0/24",
  serviceCidr: "10.254.255.0/24",
  clusterDnsIp: "10.254.255.10",
  clusterDomain: "jetski.local",
  bridged: Boolean(Deno.env.get("JETSKI_INSTANCE_BRIDGED")),
  externalNetworkCidr: Deno.env.get("JETSKI_INSTANCE_FILTER_SSH_IP_BY_CIDR"),
  disableComponents: {
    traefik: true,
    metricsServer: true
  },
  nodeLabels: {
    "com.jetski/foo": "bar",
    "com.jetski/baz": "boo",
  },
  sshDirectoryPath: "./.ssh",
  // datastoreEndpoint: "http://192.168.2.22:2379"
  kubelet: {
    maxPods: 500
  }
} satisfies ServerInstanceConfig;
