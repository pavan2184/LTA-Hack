"use client";
import { logout } from "@/app/login/actions";
export function SignOut() {
  return <form action={logout} onSubmit={(event) => {
    if (!window.dispatchEvent(new Event("workspace-before-leave", { cancelable: true }))) event.preventDefault();
  }}><button className="rounded border border-rule-strong px-3 py-1.5 text-sm text-accent hover:bg-sunk" type="submit">Sign out</button></form>;
}
