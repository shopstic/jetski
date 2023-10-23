import { AgentInstanceConfig } from "../../src/types.ts";
import serverInstanceConfig from "./multi-1.ts";

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
  name: "jetski-multi-node-2",
  image: "22.04",
  cpus: 15,
  memoryGiBs: 55,
  diskGiBs: 200,
  nodeLabels: {
    "com.jetski/foo": "bar",
    "com.jetski/baz": "boo",
  },
} satisfies AgentInstanceConfig;
