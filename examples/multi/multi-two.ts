import { ServerInstanceConfig } from "../../src/types.ts";
import bootstrapInstanceConfig from "./multi-one.ts";

export default {
  ...bootstrapInstanceConfig,
  name: "jetski-multi-node-two",
  image: "22.04",
  cpus: 1,
  memoryGiBs: 2,
  diskGiBs: 5,
  nodeLabels: {
    "com.jetski/foo": "bar",
    "com.jetski/baz": "boo",
  },
  isBootstrapInstance: false
} satisfies ServerInstanceConfig;
