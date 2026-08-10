import { createAppKit } from "@reown/appkit/vue";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { bsc, type AppKitNetwork } from "@reown/appkit/networks";

/** Public AppKit identifier; a local environment value may override it when needed. */
const DEFAULT_REOWN_PROJECT_ID = "189e2a70e6f257cd8a962be40bd027c5";
const projectId = String(import.meta.env.VITE_REOWN_PROJECT_ID || DEFAULT_REOWN_PROJECT_ID).trim();
const networks = [bsc] as [AppKitNetwork, ...AppKitNetwork[]];

export const isReownEnabled = Boolean(projectId);

/** Reown connects a user-controlled wallet; LIQ2 receives only provider requests. */
export function initializeReownAppKit() {
  if (!isReownEnabled) return;
  const origin = typeof window === "undefined" ? "https://private.superarb.ai" : window.location.origin;
  createAppKit({
    adapters: [new EthersAdapter()],
    networks,
    defaultNetwork: bsc,
    projectId,
    metadata: {
      name: "SuperARB LIQ2",
      description: "SuperARB LIQ2 card-slot purchase",
      url: origin,
      icons: [`${origin}/favicon.ico`],
    },
    features: {
      analytics: true,
      swaps: false,
      onramp: false,
      email: false,
      socials: false,
      history: false,
      receive: false,
      send: false,
    },
    enableWallets: true,
    enableInjected: true,
    enableEIP6963: true,
    enableReconnect: true,
  });
}
