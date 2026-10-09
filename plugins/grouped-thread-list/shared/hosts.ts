interface HostShape {
  id: string;
  type: string;
  status: string;
}

/**
 * The machine new projects and the folder dialog default to: a connected
 * persistent host, else whichever host bb lists first.
 */
export function defaultHostId(hosts: readonly HostShape[]): string {
  const host =
    hosts.find(
      (candidate) =>
        candidate.type === "persistent" && candidate.status === "connected",
    ) ?? hosts[0];
  if (host === undefined) throw new Error("No machine is available.");
  return host.id;
}
