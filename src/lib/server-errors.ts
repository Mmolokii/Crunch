/**
 * What a server function may tell the browser when a database call fails
 * (CRU-35). Raw PostgREST/Postgres messages name tables, columns, constraints
 * and policies, which helps an attacker map the schema, so they are logged
 * server-side and replaced with a generic message.
 *
 * The exception is SQLSTATE P0001: a RAISE EXCEPTION in one of our own
 * database functions ("Hours must be between 0 and 200", "Course not found").
 * Those messages are written for users and the UI shows them.
 */

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

type DbError = { message: string; code?: string | null };

export function publicError(error: DbError, where: string): Error {
  if (error.code === "P0001") return new Error(error.message);
  console.error(`[${where}] ${error.code ?? "no-code"}: ${error.message}`);
  return new Error(GENERIC_ERROR_MESSAGE);
}
