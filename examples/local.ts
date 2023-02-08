import { InstanceConfig } from "../src/types.ts";

export default {
  name: "jetski-example",
  image: "lts",
  cpus: 1,
  memoryGiBs: 2,
  diskGiBs: 10,
  k3sVersion: "v1.23.16+k3s1",
  clusterCidr: "10.254.254.0/24",
  serviceCidr: "10.254.255.0/24",
  clusterDnsIp: "10.254.255.10",
  clusterDomain: "jetski.local",
  disableComponents: {
    traefik: true,
    metricsServer: true
  },
  nodeLabels: {
    "com.jetski/foo": "bar",
    "com.jetski/baz": "boo",
  },
  sshDirectoryPath: "./local/.ssh",
  // datastoreEndpoint: "http://192.168.2.22:2379"
} as InstanceConfig;
