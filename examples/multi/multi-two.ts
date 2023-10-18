import { AgentInstanceConfig } from "../../src/types.ts";
import serverInstanceConfig from "./multi-one.ts";

const {
  k3sVersion,
  sshDirectoryPath,
  joinMetadataPath,
  clusterDomain,
  bridged,
  externalNetworkCidr,
  externalNetworkInterface,
} = serverInstanceConfig;

export default {
  role: "agent",
  k3sVersion,
  sshDirectoryPath,
  joinMetadataPath,
  clusterDomain,
  externalNetworkCidr,
  externalNetworkInterface,
  bridged,
  name: "jetski-multi-node-two",
  image: "22.04",
  cpus: 1,
  memoryGiBs: 2,
  diskGiBs: 5,
  nodeLabels: {
    "com.jetski/foo": "bar",
    "com.jetski/baz": "boo",
  },
} satisfies AgentInstanceConfig;
