import { logout } from "@/app/login/actions";
export function SignOut() {
  return <form action={logout}><button className="rounded border px-3 py-1.5 text-sm" type="submit">Sign out</button></form>;
}
