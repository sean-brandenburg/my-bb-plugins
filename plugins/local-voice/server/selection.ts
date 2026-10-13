export type Selection = { mode: "automatic" } | { mode: "off" } | { mode: "service"; pluginId: string; serviceId: string };

export interface ServiceSummary {
  pluginId: string;
  id: string;
  automaticRank: number | null;
  status: { ready: boolean };
  tasks: readonly string[];
}

export const SERVICE_ID = "local";

/** Whether bb sends voice recordings to this plugin's service: chosen outright, or Automatic's first ready pick. */
export function voiceUsesUs(selection: Selection, services: readonly ServiceSummary[], pluginId: string): boolean {
  if (selection.mode === "off") return false;
  if (selection.mode === "service") return selection.pluginId === pluginId && selection.serviceId === SERVICE_ID;
  const first = services
    .filter((service) => service.tasks.includes("voice") && service.automaticRank !== null && service.status.ready)
    .sort((a, b) => (a.automaticRank ?? 0) - (b.automaticRank ?? 0))[0];
  return first !== undefined && first.pluginId === pluginId && first.id === SERVICE_ID;
}

export function describeSelection(selection: Selection, pluginId: string): string {
  if (selection.mode === "off") return "off";
  if (selection.mode === "automatic") return "automatic";
  return selection.pluginId === pluginId && selection.serviceId === SERVICE_ID ? "this plugin" : `${selection.pluginId}/${selection.serviceId}`;
}
