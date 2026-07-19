export class TelegramLoggerService {
  private static getCredentials() {
    // В Cloudflare Workers с nodejs_compat переменные могут находиться как в process.env, так и глобально
    const token = process.env.TELEGRAM_BOT_TOKEN || (globalThis as any).TELEGRAM_BOT_TOKEN;
    const chat = process.env.TELEGRAM_CHAT_ID || (globalThis as any).TELEGRAM_CHAT_ID;
    return { token, chat };
  }

  static async log(message: string): Promise<void> {
    const { token, chat } = this.getCredentials();
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
