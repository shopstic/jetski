import { AgentInstanceConfig } from "../../src/types.ts";
import agentInstanceConfig from "./multi-two.ts";

export default {
  ...agentInstanceConfig,
  name: "jetski-multi-node-three",
  nodeLabels: {
    "com.jetski/foo": "something",
    "com.jetski/baz": "else",
  },
} satisfies AgentInstanceConfig;
