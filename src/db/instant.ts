import { init } from "@instantdb/react";
import schema from "./schema";

const appId = import.meta.env.VITE_INSTANT_APP_ID;

if (!appId) {
  throw new Error(
    "VITE_INSTANT_APP_ID is not set. Add it to your .env file.",
  );
}

export const db = init({
  appId,
  schema,
});
