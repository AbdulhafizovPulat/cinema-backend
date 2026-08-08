import { db } from './index.js';
import { users } from './schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function seedAdmin() {
  const adminEmail = 'admin@cinema.com';
  const existingUser = await db.select().from(users).where(eq(users.email, adminEmail)).get();

  if (!existingUser) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('admin12345', salt);

    await db.insert(users).values({
      email: adminEmail,
      passwordHash,
      role: 'admin',
      firstName: 'Admin',
      lastName: 'Cinema',
      phoneNumber: '+998900000000',
    });

    console.log(`✅ Пользователь ${adminEmail} успешно создан с ролью admin!`);
  } else {
    console.log(`ℹ️ Пользователь ${adminEmail} уже существует в базе данных.`);
  }
}

seedAdmin().catch(console.error);
