import { google } from "googleapis";
import type { Config } from "../config.js";

export function makeOAuth2Client(config: Config) {
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    `${config.serverUrl}/oauth/callback`
  );
}
