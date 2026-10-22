// bb-plugin-activity — frontend entry.
//
// A content script records clicks, keys, and pages across all of bb and
// posts them to the server in batches; the Activity page reads them back.
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import "bb-motion/motion.css";
import { useEffect } from "react";
import { mountCollector } from "./collector";
import type { ActivityEvent, rpcContract } from "./contract";
import { ActivityPage } from "./ui/ActivityPage";

let send: ((events: ActivityEvent[]) => Promise<void>) | null = null;

// Content scripts have no hook access, so this always-mounted overlay lends the collector its RPC channel.
function RpcBridge() {
  const rpc = useRpc<typeof rpcContract>();
  useEffect(() => {
    send = async (events) => {
      await rpc.call("record", { events });
    };
    return () => {
      send = null;
    };
  }, [rpc]);
  return null;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "rpc-bridge", component: RpcBridge });
  app.contentScripts.register({
    id: "collector",
    mount() {
      const collector = mountCollector(document, window, {
        send: (events) => (send === null ? Promise.reject(new Error("The activity plugin's RPC bridge isn't mounted yet.")) : send(events)),
      });
      return () => collector.dispose();
    },
  });
  app.slots.navPanel({ id: "activity", title: "Activity", icon: "Activity", path: "log", component: ActivityPage });
});
