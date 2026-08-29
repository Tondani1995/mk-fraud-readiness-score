/**
 * next/navigation stub for the static design-review renderer.
 *
 * The real hook requires a mounted app router, which does not exist outside Next. Only the
 * static first paint is being captured, so navigation is never invoked.
 */
export function useRouter() {
  return { push() {}, replace() {}, back() {}, forward() {}, refresh() {}, prefetch() {} };
}
export function usePathname() { return '/score/snapshot/MKFRS-2026-B3B38A3143'; }
export function useSearchParams() { return new URLSearchParams(); }
export function redirect() {}
