type LogoutCallback = () => void;

let globalLogoutCallback: LogoutCallback | null = null;

export function setGlobalLogoutCallback(callback: LogoutCallback | null) {
  globalLogoutCallback = callback;
}

export function triggerGlobalLogout() {
  if (globalLogoutCallback) {
    globalLogoutCallback();
  }
}

export function isLogoutTriggered(): boolean {
  return globalLogoutCallback !== null;
}
