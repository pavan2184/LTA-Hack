"use client";

import { useEffect, useRef } from "react";

const message = "Discard unsaved changes and leave this view?";
const approvedEvents = new WeakSet<Event>();

/** Confirms exits while edited content remains in React memory. */
export function useUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    let previousUrl = window.location.href;
    let previousState = window.history.state;
    let traversalApproved = false;
    const navigation = window.navigation;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      if (approvedEvents.has(event)) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (dirtyRef.current) {
        if (window.confirm(message)) approvedEvents.add(event);
        else { event.preventDefault(); event.stopImmediatePropagation(); }
      }
    };
    const remember = () => { previousUrl = window.location.href; previousState = window.history.state; };
    const navigate = (event: NavigateEvent) => {
      if (event.navigationType !== "traverse" || !event.cancelable || event.defaultPrevented || !dirtyRef.current) return;
      if (approvedEvents.has(event) || window.confirm(message)) {
        approvedEvents.add(event);
        traversalApproved = true;
      } else {
        // Cancel before native traversal changes either the URL or Next's tree.
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const navigationError = () => { traversalApproved = false; };
    const pop = (event: PopStateEvent) => {
      if (traversalApproved) { approvedEvents.add(event); traversalApproved = false; }
      if (!approvedEvents.has(event) && dirtyRef.current) {
        // Older browsers have no cancellable pre-traversal event. Stop router
        // listeners before showing the modal, then replay only an approved pop.
        event.stopImmediatePropagation();
        if (window.confirm(message)) {
          const approved = new PopStateEvent("popstate", { state: event.state });
          approvedEvents.add(approved);
          window.dispatchEvent(approved);
        } else window.history.pushState(previousState, "", previousUrl);
        return;
      }
      if (dirtyRef.current) approvedEvents.add(event);
      remember();
    };
    const leave = (event: Event) => {
      if (event.defaultPrevented || approvedEvents.has(event) || !dirtyRef.current) return;
      if (window.confirm(message)) approvedEvents.add(event); else event.preventDefault();
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", pop, true);
    window.addEventListener("request-selection", remember);
    window.addEventListener("workspace-before-leave", leave);
    navigation?.addEventListener("navigate", navigate);
    navigation?.addEventListener("navigateerror", navigationError);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", pop, true);
      window.removeEventListener("request-selection", remember);
      window.removeEventListener("workspace-before-leave", leave);
      navigation?.removeEventListener("navigate", navigate);
      navigation?.removeEventListener("navigateerror", navigationError);
    };
  }, [dirty]);
  return () => !dirtyRef.current || window.confirm(message);
}

export function writeSelection(key: "request" | "draft", id: string | null) {
  if (!/^\/(requests|contractor)(\/drafts)?$/.test(window.location.pathname)) return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set(key, id); else url.searchParams.delete(key);
  if (url.href !== window.location.href) window.history.pushState(null, "", url);
  window.dispatchEvent(new Event("request-selection"));
}
