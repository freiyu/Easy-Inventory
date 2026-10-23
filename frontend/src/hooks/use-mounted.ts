import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False during server render and hydration, true afterwards (avoids hydration mismatches). */
export const useMounted = () =>
  useSyncExternalStore(subscribe, () => true, () => false);
