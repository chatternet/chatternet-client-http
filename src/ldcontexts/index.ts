import { activitystreams } from "./activitystreams.js";
import { credentials } from "./credentials.js";
import { ed25519_2020 } from "./ed25519-2020.js";

export const contexts: { [key: string]: object } = {
  [activitystreams.uri]: activitystreams.ctx,
  [credentials.uri]: credentials.ctx,
  [ed25519_2020.uri]: ed25519_2020.ctx,
  "https://w3id.org/security/suites/ed25519-2020/v1": ed25519_2020.ctx,
};
