/** Persisted roles are assigned by trusted operators, never by signup metadata. */
export type UserRole = "planner" | "contractor";
export interface Actor {
  id: string;
  role: UserRole;
  contractorOrganisationId: string | null;
}
