interface LoginAttemptData {
  attempts: number;
  lockUntil: number;
  lastAttempt: number;
}

// Карта для отслеживания неудачных попыток входа по email (защита от Brute-Force)
const loginAttemptsMap = new Map<string, LoginAttemptData>();

const MAX_ATTEMPTS = 5; // Максимально разрешенное количество ошибочных попыток
const LOCKOUT_TIME_MS = 15 * 60 * 1000; // Время блокировки в мс (15 минут)

export class LoginLimiterService {
  /**
   * Проверяет, заблокирован ли email из-за частых ошибочных попыток входа
   */
  static isLockedOut(email: string): { locked: boolean; remainingSeconds: number } {
    const cleanEmail = email.trim().toLowerCase();
    const data = loginAttemptsMap.get(cleanEmail);

    if (!data) {
      return { locked: false, remainingSeconds: 0 };
    }

    const now = Date.now();
    if (data.lockUntil > now) {
      const remainingSeconds = Math.ceil((data.lockUntil - now) / 1000);
      return { locked: true, remainingSeconds };
    }

    // Если время блокировки прошло, сбрасываем устаревшую запись
    if (data.lockUntil > 0 && now >= data.lockUntil) {
      loginAttemptsMap.delete(cleanEmail);
    }

    return { locked: false, remainingSeconds: 0 };
  }

  /**
   * Регистрирует неудачную попытку входа для указанного email
   */
  static recordFailedAttempt(email: string): { attempts: number; locked: boolean; remainingSeconds: number } {
    const cleanEmail = email.trim().toLowerCase();
    const now = Date.now();
    let data = loginAttemptsMap.get(cleanEmail);

    if (!data || (data.lockUntil > 0 && now >= data.lockUntil)) {
      data = { attempts: 1, lockUntil: 0, lastAttempt: now };
    } else {
      data.attempts += 1;
      data.lastAttempt = now;
    }

    if (data.attempts >= MAX_ATTEMPTS) {
      data.lockUntil = now + LOCKOUT_TIME_MS;
      loginAttemptsMap.set(cleanEmail, data);
      const remainingSeconds = Math.ceil(LOCKOUT_TIME_MS / 1000);
      return { attempts: data.attempts, locked: true, remainingSeconds };
    }

    loginAttemptsMap.set(cleanEmail, data);
    return { attempts: data.attempts, locked: false, remainingSeconds: 0 };
  }

  /**
   * Сбрасывает счетчик неудачных попыток при успешном входе или вручную
   */
  static resetAttempts(email?: string): void {
    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      loginAttemptsMap.delete(cleanEmail);
      console.log(`[LoginLimiter] Счетчик попыток сброшен для: ${cleanEmail}`);
    } else {
      loginAttemptsMap.clear();
      console.log(`[LoginLimiter] Все счетчики попыток входа сброшены.`);
    }
  }

  /**
   * Возвращает текущее количество неудачных попыток для email
   */
  static getAttempts(email: string): number {
    const cleanEmail = email.trim().toLowerCase();
    return loginAttemptsMap.get(cleanEmail)?.attempts || 0;
  }
}
