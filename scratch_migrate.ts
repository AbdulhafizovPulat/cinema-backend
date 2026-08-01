import { createClient } from "@libsql/client";
const client = createClient({ url: "file:cinema.db" });
client.execute("ALTER TABLE categories ADD COLUMN locales text DEFAULT '[]' NOT NULL;")
  .then(() => console.log('Table categories altered successfully!'))
  .catch((e) => console.error('Migration error:', e.message));
