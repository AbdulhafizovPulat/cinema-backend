export class TelegramLoggerService {
  private static async getCredentials() {
    let token = process.env.TELEGRAM_BOT_TOKEN || (globalThis as any).TELEGRAM_BOT_TOKEN;
    let chat = process.env.TELEGRAM_CHAT_ID || (globalThis as any).TELEGRAM_CHAT_ID;

    const isCF = typeof globalThis !== 'undefined' && (
      'WebSocketPair' in globalThis || 
      'cinema_db' in globalThis || 
      (globalThis as any).MINIFLARE === true
    );

    if (isCF && (!token || !chat)) {
      try {
        // @ts-ignore
        const cfWorkers = await import('cloudflare:workers');
        if (cfWorkers?.env) {
          if (!token) token = cfWorkers.env.TELEGRAM_BOT_TOKEN;
          if (!chat) chat = cfWorkers.env.TELEGRAM_CHAT_ID;
        }
      } catch (e) {
        console.error("► TelegramLoggerService: Ошибка получения env из cloudflare:workers:", e);
      }
    }
    return { token, chat };
  }

  static async log(message: string): Promise<void> {
    const { token, chat } = await this.getCredentials();
    if (!token || !chat) {
      console.warn("► TelegramLoggerService: Отсутствуют учетные данные Telegram (Token или Chat ID)");
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chat,
          text: message
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`► TelegramLoggerService: Ошибка отправки статус: ${response.status}, ответ: ${errorText}`);
      }
    } catch (error) {
      console.error("► TelegramLoggerService: Ошибка отправки сообщения в Telegram:", error);
    }
  }
}
