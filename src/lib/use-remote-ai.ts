import { useEffect, useState } from "react";
import {
  REMOTE_CHANGED_EVENT,
  hasRemoteKey,
  loadRemoteConfig,
  remoteKeyLocation,
  type RemoteConfig,
  type RemoteProvider,
} from "./remote-ai";

export function useRemoteConfig(): RemoteConfig {
  const [config, setConfig] = useState<RemoteConfig>(() => loadRemoteConfig());
  useEffect(() => {
    const refresh = () => setConfig(loadRemoteConfig());
    window.addEventListener(REMOTE_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(REMOTE_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return config;
}

export function useRemoteKey(provider: RemoteProvider): {
  hasKey: boolean;
  location: "session" | "device" | "none";
} {
  const [state, setState] = useState(() => ({
    hasKey: hasRemoteKey(provider),
    location: remoteKeyLocation(provider),
  }));
  useEffect(() => {
    const refresh = () =>
      setState({ hasKey: hasRemoteKey(provider), location: remoteKeyLocation(provider) });
    refresh();
    window.addEventListener(REMOTE_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(REMOTE_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [provider]);
  return state;
}
