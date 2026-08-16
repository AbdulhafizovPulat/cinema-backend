import { createClient } from '@libsql/client';

const client = createClient({ url: 'file:d:/diplom/cinema-backend/cinema.db' });

async function run() {
  try {
    const res = await client.execute('SELECT * FROM purchases');
    console.log(res.rows);
  } catch (e) {
    console.error(e);
  }
}
run();
