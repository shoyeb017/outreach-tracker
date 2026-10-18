export function useRouter() { return { refresh() {}, push(path: string) { window.history.pushState(null, "", path); } }; }
