export default {
  name: "local",
  image: "focal",
  cpus: 1,
  memoryGiBs: 1,
  diskGiBs: 4,
  k3sVersion: "v1.21.9+k3s1",
  clusterCidr: "10.254.254.0/24",
  serviceCidr: "10.254.255.0/24",
  clusterDnsIp: "10.254.255.10",
  clusterDomain: "jetski.local",
  nodeLabels: {
    "com.jetski/foo": "bar",
    "com.jetski/baz": "boo",
  },
  sshDirectoryPath: "./local/.ssh",
};
