import { resetNamespace } from "./helpers";

/**
 * E2E runs sign in repeatedly from one IP, which is exactly what the login
 * throttle exists to stop. Like resetting a test database, clear the
 * `limits` namespace before the run (needs the admin token from .env.local).
 */
export default async function globalSetup() {
  await resetNamespace("limits");
}
