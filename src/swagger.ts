import swaggerJSDoc from 'swagger-jsdoc';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cinema API (Система онлайн-кинотеатра)',
      version: '1.0.0',
      description: 'API бэкенда для онлайн-кинотеатра с поддержкой авторизации, каталога фильмов, покупки фильмов и подписок.',
      contact: {
        name: 'Developer Support',
      },
    },
    servers: [
      {
        url: 'https://cinema-backend.cinema-abdulhafizov.workers.dev',
        description: 'Продакшен сервер (Cloudflare Workers)',
      },
      {
        url: 'http://localhost:3000',
        description: 'Локальный сервер разработки',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Введите JWT токен в формате: Bearer <ваш_токен>',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            email: { type: 'string', format: 'email', example: 'client@example.com' },
            role: { type: 'string', enum: ['client', 'admin'], example: 'client' },
            firstName: { type: 'string', example: 'Иван' },
            lastName: { type: 'string', example: 'Иванов' },
            phoneNumber: { type: 'string', example: '+79998887766' },
            cardNumber: { type: 'string', nullable: true, example: '4276123456789012' },
            createdAt: { type: 'string', format: 'date-time', example: '2026-07-15T06:00:00.000Z' },
          },
        },
        Movie: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            title: { type: 'string', example: 'Матрица' },
            description: { type: 'string', example: 'Культовый научно-фантастический боевик.' },
            videoUrl: { type: 'string', example: 'https://example.com/matrix.mp4' },
            isPremium: { type: 'boolean', example: true },
            author: { type: 'string', example: 'Лана Вачовски' },
            tags: { type: 'array', items: { type: 'string' }, example: ['фантастика', 'боевик'] },
            category: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'integer', example: 2 },
                name: { type: 'string', example: 'Фантастика' },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Category: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Сериалы' },
            locales: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  localeKey: { type: 'string', example: 'en' },
                  title: { type: 'string', example: 'Series' },
                  description: { type: 'string', example: 'TV Series' }
                }
              },
              example: [{ localeKey: 'en', title: 'Series', description: 'TV Series' }]
            },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        SubscriptionType: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Месячный Premium' },
            price: { type: 'number', example: 299.0 },
            durationDays: { type: 'integer', example: 30 },
          },
        },
        Purchase: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            userId: { type: 'integer', example: 1 },
            movieId: { type: 'integer', nullable: true, example: null },
            subscriptionTypeId: { type: 'integer', nullable: true, example: 2 },
            amount: { type: 'number', example: 299.0 },
            status: { type: 'string', enum: ['pending', 'completed'], example: 'completed' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    paths: {
      '/api/auth/register': {
        post: {
          summary: 'Регистрация нового пользователя',
          tags: ['Auth (Авторизация)'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password', 'firstName', 'lastName', 'phoneNumber'],
                  properties: {
                    email: { type: 'string', example: 'client@example.com' },
                    password: { type: 'string', example: 'securepass123' },
                    role: { type: 'string', enum: ['client', 'admin'], example: 'client' },
                    firstName: { type: 'string', example: 'Иван' },
                    lastName: { type: 'string', example: 'Иванов' },
                    phoneNumber: { type: 'string', example: '+79998887766' },
                    cardNumber: { type: 'string', example: '4276123456789012' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Пользователь успешно зарегистрирован' },
            400: { description: 'Неверные данные или email уже занят' },
          },
        },
      },
      '/api/auth/login': {
        post: {
          summary: 'Авторизация пользователя и получение JWT-токена',
          tags: ['Auth (Авторизация)'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', example: 'client@example.com' },
                    password: { type: 'string', example: 'securepass123' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Авторизация успешна, токен возвращен' },
            400: { description: 'Неверный логин или пароль' },
          },
        },
      },
      '/api/auth/forgot-password': {
        post: {
          summary: 'Запрос на сброс пароля (Забыл пароль)',
          tags: ['Auth (Авторизация)'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: {
                    email: { type: 'string', example: 'client@example.com' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Токен сброса пароля успешно сгенерирован' },
            404: { description: 'Пользователь не найден' },
          },
        },
      },
      '/api/auth/reset-password': {
        post: {
          summary: 'Подтверждение сброса пароля (Установка нового)',
          tags: ['Auth (Авторизация)'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'newPassword'],
                  properties: {
                    token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsIn...' },
                    newPassword: { type: 'string', example: 'newsecurepass123' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Пароль успешно изменен' },
            400: { description: 'Токен недействителен, изменен или истек' },
          },
        },
      },
      '/api/users/profile': {
        get: {
          summary: 'Получить профиль текущего пользователя',
          tags: ['Users & Profile (Пользователи и Профиль)'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: 'Данные профиля',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            404: { description: 'Пользователь не найден' },
          },
        },
        put: {
          summary: 'Обновить личный профиль',
          tags: ['Users & Profile (Пользователи и Профиль)'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    firstName: { type: 'string', example: 'Петр' },
                    lastName: { type: 'string', example: 'Петров' },
                    phoneNumber: { type: 'string', example: '+79991112233' },
                    cardNumber: { type: 'string', example: '5555444433332222' },
                    password: { type: 'string', example: 'newsecurepass123' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Профиль обновлен' },
            404: { description: 'Пользователь не найден' },
          },
        },
      },
      '/api/users': {
        get: {
          summary: 'Получить список всех пользователей с пагинацией и фильтрами (Доступно только Admin)',
          tags: ['Users & Profile (Пользователи и Профиль)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 }, description: 'Номер страницы' },
            { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', enum: [10, 20, 50], default: 10 }, description: 'Количество пользователей на страницу' },
            { name: 'fullName', in: 'query', required: false, schema: { type: 'string' }, description: 'Фильтр по имени и фамилии (частичный)' },
            { name: 'phoneNumber', in: 'query', required: false, schema: { type: 'string' }, description: 'Фильтр по номеру телефона (частичный)' },
            { name: 'role', in: 'query', required: false, schema: { type: 'string', enum: ['client', 'admin'] }, description: 'Фильтр по роли' },
            { name: 'cardNumber', in: 'query', required: false, schema: { type: 'string' }, description: 'Фильтр по номеру карты (частичный)' },
            { name: 'createdAt', in: 'query', required: false, schema: { type: 'string' }, description: 'Фильтр по дате создания (ISO строка)' },
          ],
          responses: {
            200: {
              description: 'Страница списка пользователей',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      items: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                      page: { type: 'integer', example: 1 },
                      pageSize: { type: 'integer', example: 10 },
                      totalPages: { type: 'integer', example: 5 },
                      totalResults: { type: 'integer', example: 48 },
                    },
                  },
                },
              },
            },
            403: { description: 'Доступ запрещен (не админ)' },
          },
        },
        post: {
          summary: 'Создать нового пользователя (Доступно только Admin)',
          tags: ['Users & Profile (Пользователи и Профиль)'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password', 'firstName', 'lastName', 'phoneNumber'],
                  properties: {
                    email: { type: 'string', example: 'newuser@example.com' },
                    password: { type: 'string', example: 'password123' },
                    firstName: { type: 'string', example: 'Иван' },
                    lastName: { type: 'string', example: 'Иванов' },
                    phoneNumber: { type: 'string', example: '+79998887766' },
                    cardNumber: { type: 'string', example: '4276123456789012' },
                    role: { type: 'string', enum: ['client', 'admin'], example: 'client' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Пользователь успешно создан',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string', example: 'Пользователь успешно создан' },
                      user: { $ref: '#/components/schemas/User' },
                    },
                  },
                },
              },
            },
            400: { description: 'Неверные данные или email уже занят' },
            403: { description: 'Доступ запрещен (не админ)' },
          },
        },
      },
      '/api/users/{id}': {
        get: {
          summary: 'Получить детальную информацию о пользователе (Доступно только Admin)',
          tags: ['Users & Profile (Пользователи и Профиль)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: {
              description: 'Детальные данные пользователя',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/User' },
                },
              },
            },
            404: { description: 'Пользователь не найден' },
          },
        },
        put: {
          summary: 'Редактировать любого пользователя (Доступно только Admin)',
          tags: ['Users & Profile (Пользователи и Профиль)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    phoneNumber: { type: 'string' },
                    cardNumber: { type: 'string' },
                    role: { type: 'string', enum: ['client', 'admin'] },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Пользователь обновлен' },
            404: { description: 'Пользователь не найден' },
          },
        },
        delete: {
          summary: 'Удалить пользователя (Доступно только Admin)',
          tags: ['Users & Profile (Пользователи и Профиль)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: { description: 'Пользователь удален' },
            404: { description: 'Пользователь не найден' },
          },
        },
      },
      '/api/categories': {
        get: {
          summary: 'Получить список всех категорий с пагинацией и фильтрами',
          tags: ['Categories (Категории)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 }, description: 'Номер страницы' },
            { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', enum: [10, 20, 50], default: 10 }, description: 'Количество категорий на страницу' },
            { name: 'name', in: 'query', required: false, schema: { type: 'string' }, description: 'Фильтр по названию категории (частичный)' },
          ],
          responses: {
            200: {
              description: 'Страница списка категорий',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      items: { type: 'array', items: { $ref: '#/components/schemas/Category' } },
                      page: { type: 'integer', example: 1 },
                      pageSize: { type: 'integer', example: 10 },
                      totalPages: { type: 'integer', example: 3 },
                      totalResults: { type: 'integer', example: 25 },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Создать новую категорию (Доступно только Admin)',
          tags: ['Categories (Категории)'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', example: 'Сериалы' },
                    locales: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          localeKey: { type: 'string' },
                          title: { type: 'string' },
                          description: { type: 'string' }
                        }
                      }
                    }
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Категория создана' },
            400: { description: 'Категория с таким именем уже существует или имя пустое' },
          },
        },
      },
      '/api/categories/{id}': {
        get: {
          summary: 'Получить информацию о категории по ID',
          tags: ['Categories (Категории)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: {
              description: 'Данные категории',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Category' },
                },
              },
            },
            400: { description: 'Неверный ID категории' },
            404: { description: 'Категория не найдена' },
          },
        },
        put: {
          summary: 'Обновить категорию (Доступно только Admin)',
          tags: ['Categories (Категории)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name'],
                  properties: {
                    name: { type: 'string', example: 'Комедии' },
                    locales: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          localeKey: { type: 'string' },
                          title: { type: 'string' },
                          description: { type: 'string' }
                        }
                      }
                    }
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Категория обновлена' },
            404: { description: 'Категория не найдена' },
          },
        },
        delete: {
          summary: 'Удалить категорию (Доступно только Admin)',
          tags: ['Categories (Категории)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: { description: 'Категория удалена' },
            404: { description: 'Категория не найдена' },
          },
        },
      },
      '/api/movies': {
        get: {
          summary: 'Получить каталог фильмов с пагинацией и фильтрами',
          tags: ['Movies (Фильмы)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 }, description: 'Номер страницы' },
            { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', enum: [10, 20, 50], default: 10 }, description: 'Количество фильмов на страницу' },
            { name: 'title', in: 'query', required: false, schema: { type: 'string' }, description: 'Фильтр по названию фильма (частичный)' },
            { name: 'author', in: 'query', required: false, schema: { type: 'string' }, description: 'Фильтр по автору / режиссеру' },
            { name: 'tag', in: 'query', required: false, schema: { type: 'string' }, description: 'Фильтр по тегу / жанру' },
            { name: 'categoryName', in: 'query', required: false, schema: { type: 'string' }, description: 'Фильтр по названию категории (частичный)' },
            { name: 'isPremium', in: 'query', required: false, schema: { type: 'boolean' }, description: 'Фильтр премиум-статуса' },
            { name: 'sortBy', in: 'query', required: false, schema: { type: 'string', enum: ['rating', 'createdAt'] }, description: 'Сортировать по рейтингу ("rating") или дате добавления ("createdAt")' },
            { name: 'sortOrder', in: 'query', required: false, schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }, description: 'Направление сортировки' },
          ],
          responses: {
            200: {
              description: 'Страница каталога фильмов',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      page: { type: 'integer', example: 1 },
                      pageSize: { type: 'integer', example: 10 },
                      totalPages: { type: 'integer', example: 2 },
                      totalResults: { type: 'integer', example: 15 },
                      items: {
                        type: 'array',
                        items: {
                          allOf: [
                            { $ref: '#/components/schemas/Movie' },
                            {
                              type: 'object',
                              properties: {
                                averageRating: { type: 'number', example: 8.5 },
                                ratingCount: { type: 'integer', example: 12 },
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Добавить новый фильм (Доступно только Admin)',
          tags: ['Movies (Фильмы)'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'description', 'videoUrl'],
                  properties: {
                    title: { type: 'string', example: 'Интерстеллар' },
                    description: { type: 'string', example: 'Фильм про космос и путешествия во времени.' },
                    videoUrl: { type: 'string', example: 'https://example.com/interstellar.mp4' },
                    isPremium: { type: 'boolean', example: true },
                    author: { type: 'string', example: 'Кристофер Нолан' },
                    tags: { type: 'array', items: { type: 'string' }, example: ['фантастика', 'драма'] },
                    categoryId: { type: 'integer', example: 1, description: 'ID связанной категории (опционально)' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Фильм добавлен успешно' },
            403: { description: 'Доступ запрещен (не админ)' },
          },
        },
      },
      '/api/movies/{id}': {
        get: {
          summary: 'Подробная информация о фильме (Для страницы детального просмотра фильма)',
          tags: ['Movies (Фильмы)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: {
              description: 'Детальные данные фильма, отзывы и статус доступа для текущего пользователя',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      movie: { $ref: '#/components/schemas/Movie' },
                      ratings: {
                        type: 'object',
                        properties: {
                          averageRating: { type: 'number', example: 8.5 },
                          ratingCount: { type: 'integer', example: 12 },
                          list: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'integer' },
                                rating: { type: 'integer', example: 9 },
                                comment: { type: 'string', example: 'Отличный фильм!' },
                                createdAt: { type: 'string' },
                                userEmail: { type: 'string', example: 'user@example.com' },
                              },
                            },
                          },
                        },
                      },
                      userAccess: {
                        type: 'object',
                        properties: {
                          hasAccess: { type: 'boolean', example: true },
                          message: { type: 'string', example: 'Просмотр разрешен' },
                        },
                      },
                    },
                  },
                },
              },
            },
            404: { description: 'Фильм не найден' },
          },
        },
        put: {
          summary: 'Обновить фильм (Доступно только Admin)',
          tags: ['Movies (Фильмы)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    description: { type: 'string' },
                    videoUrl: { type: 'string' },
                    isPremium: { type: 'boolean' },
                    author: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } },
                    categoryId: { type: 'integer', nullable: true, example: 1 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Фильм обновлен' },
            404: { description: 'Фильм не найден' },
          },
        },
        delete: {
          summary: 'Удалить фильм (Доступно только Admin)',
          tags: ['Movies (Фильмы)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: { description: 'Фильм удален' },
            404: { description: 'Фильм не найден' },
          },
        },
      },
      '/api/movies/{id}/rate': {
        post: {
          summary: 'Оценить фильм и оставить отзыв',
          tags: ['Movies (Фильмы)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['rating'],
                  properties: {
                    rating: { type: 'integer', minimum: 1, maximum: 10, example: 9, description: 'Оценка фильма от 1 до 10' },
                    comment: { type: 'string', example: 'Шедевр! Всем советую к просмотру.', description: 'Текстовый отзыв' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Оценка сохранена' },
            400: { description: 'Невалидная оценка или ID фильма' },
          },
        },
      },
      '/api/movies/{id}/stream': {
        get: {
          summary: 'Стриминг фильма (Проверяет подписку/покупку)',
          tags: ['Movies (Фильмы)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: {
              description: 'Доступ получен, ссылка на видео возвращена',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                      videoUrl: { type: 'string' },
                    },
                  },
                },
              },
            },
            403: { description: 'Доступ запрещен (нужна подписка или покупка)' },
          },
        },
      },
      '/api/purchases/subscription-types': {
        get: {
          summary: 'Получить доступные тарифы подписок',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          responses: {
            200: {
              description: 'Список планов подписок',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      items: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/SubscriptionType' },
                      },
                      page: { type: 'integer', example: 1 },
                      pageSize: { type: 'integer', example: 10 },
                      totalPages: { type: 'integer', example: 1 },
                      totalResults: { type: 'integer', example: 2 },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Создать новый тарифный план подписки (Доступно только Admin)',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'price', 'durationDays'],
                  properties: {
                    name: { type: 'string', example: 'Месячная подписка' },
                    price: { type: 'number', example: 299.0 },
                    durationDays: { type: 'integer', example: 30 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Тариф создана' },
            400: { description: 'Невалидные входные данные' },
          },
        },
      },
      '/api/purchases/subscription-types/{id}': {
        get: {
          summary: 'Получить описание конкретного тарифа подписки',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: {
              description: 'Данные тарифа подписки',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SubscriptionType' },
                },
              },
            },
            404: { description: 'Тариф не найден' },
          },
        },
        put: {
          summary: 'Обновить тарифный план подписки (Доступно только Admin)',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    price: { type: 'number' },
                    durationDays: { type: 'integer' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Тариф обновлен' },
            404: { description: 'Тариф не найден' },
          },
        },
        delete: {
          summary: 'Удалить тарифный план подписки (Доступно только Admin)',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          responses: {
            200: { description: 'Тариф удален' },
            404: { description: 'Тариф не найден' },
          },
        },
      },
      '/api/purchases/buy-movie': {
        post: {
          summary: 'Покупка отдельного фильма',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['movieId'],
                  properties: {
                    movieId: { type: 'integer', example: 1 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Покупка успешно завершена' },
            400: { description: 'Фильм уже куплен или неверный ID' },
          },
        },
      },
      '/api/purchases/subscribe': {
        post: {
          summary: 'Оформление / продление подписки',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['subscriptionTypeId'],
                  properties: {
                    subscriptionTypeId: { type: 'integer', example: 1 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Подписка успешно куплена/продлена' },
          },
        },
      },
      '/api/purchases/history': {
        get: {
          summary: 'История платежей (покупок) с пагинацией и фильтрами',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 }, description: 'Номер страницы' },
            { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', enum: [10, 20, 50], default: 10 }, description: 'Количество записей на страницу' },
            { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['completed', 'pending'] }, description: 'Фильтр статуса транзакции' },
            { name: 'type', in: 'query', required: false, schema: { type: 'string', enum: ['movie', 'subscription'] }, description: 'Фильтр типа покупки (фильм или подписка)' },
            { name: 'userId', in: 'query', required: false, schema: { type: 'integer' }, description: 'Фильтр по ID пользователя (доступно только Admin)' },
          ],
          responses: {
            200: {
              description: 'Пагинированный список транзакций',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      items: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer' },
                            userId: { type: 'integer' },
                            amount: { type: 'number' },
                            status: { type: 'string' },
                            createdAt: { type: 'string' },
                            movieId: { type: 'integer', nullable: true },
                            movieTitle: { type: 'string', nullable: true },
                            subscriptionTypeId: { type: 'integer', nullable: true },
                            subscriptionName: { type: 'string', nullable: true },
                            userEmail: { type: 'string' },
                          },
                        },
                      },
                      page: { type: 'integer', example: 1 },
                      pageSize: { type: 'integer', example: 10 },
                      totalPages: { type: 'integer', example: 2 },
                      totalResults: { type: 'integer', example: 15 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/purchases/history/{id}': {
        get: {
          summary: 'Получить детальную информацию о конкретном платеже по ID',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID транзакции' },
          ],
          responses: {
            200: {
              description: 'Информация о платеже',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      userId: { type: 'integer' },
                      amount: { type: 'number' },
                      status: { type: 'string' },
                      createdAt: { type: 'string' },
                      movieId: { type: 'integer', nullable: true },
                      movieTitle: { type: 'string', nullable: true },
                      subscriptionTypeId: { type: 'integer', nullable: true },
                      subscriptionName: { type: 'string', nullable: true },
                      userEmail: { type: 'string' },
                    },
                  },
                },
              },
            },
            403: { description: 'Доступ запрещен' },
            404: { description: 'Транзакция не найдена' },
          },
        },
      },
      '/api/purchases/subscriptions': {
        get: {
          summary: 'Список оформленных подписок пользователей с пагинацией и фильтром активности',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 }, description: 'Номер страницы' },
            { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', enum: [10, 20, 50], default: 10 }, description: 'Количество записей на страницу' },
            { name: 'isActive', in: 'query', required: false, schema: { type: 'string', enum: ['true', 'false'] }, description: 'Фильтр активности подписки' },
            { name: 'userId', in: 'query', required: false, schema: { type: 'integer' }, description: 'Фильтр по ID пользователя (доступно только Admin)' },
          ],
          responses: {
            200: {
              description: 'Пагинированный список подписок',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      items: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer' },
                            userId: { type: 'integer' },
                            subscriptionTypeId: { type: 'integer' },
                            subscriptionName: { type: 'string' },
                            expiresAt: { type: 'string' },
                            createdAt: { type: 'string' },
                            userEmail: { type: 'string' },
                          },
                        },
                      },
                      page: { type: 'integer', example: 1 },
                      pageSize: { type: 'integer', example: 10 },
                      totalPages: { type: 'integer', example: 1 },
                      totalResults: { type: 'integer', example: 3 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/purchases/subscriptions/{id}': {
        get: {
          summary: 'Получить детальную информацию о конкретной подписке по ID',
          tags: ['Purchases & Subscriptions (Оплаты и Подписки)'],
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' }, description: 'ID подписки' },
          ],
          responses: {
            200: {
              description: 'Информация о подписке',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'integer' },
                      userId: { type: 'integer' },
                      subscriptionTypeId: { type: 'integer' },
                      subscriptionName: { type: 'string' },
                      expiresAt: { type: 'string' },
                      createdAt: { type: 'string' },
                      userEmail: { type: 'string' },
                    },
                  },
                },
              },
            },
            403: { description: 'Доступ запрещен' },
            404: { description: 'Подписка не найдена' },
          },
        },
      },
      '/api/upload': {
        post: {
          summary: 'Загрузка медиа файлов (изображения, видео напр. mp4)',
          tags: ['Upload (Загрузка медиа)'],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    file: {
                      type: 'string',
                      format: 'binary',
                      description: 'Файл для загрузки (изображение или видео)',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Файл успешно загружен',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      url: {
                        type: 'string',
                        example: '/api/upload/public/1706822812345-abc1234.mp4',
                      },
                    },
                  },
                },
              },
            },
            400: { description: 'Файл не был загружен' },
            500: { description: 'Ошибка сервера при загрузке' },
          },
        },
      },
      '/api/upload/public/{filename}': {
        get: {
          summary: 'Получение загруженного медиа файла',
          tags: ['Upload (Загрузка медиа)'],
          parameters: [
            { name: 'filename', in: 'path', required: true, schema: { type: 'string' }, description: 'Имя загруженного файла' },
          ],
          responses: {
            200: {
              description: 'Файл успешно получен, возвращает бинарные данные (stream)',
              content: {
                'application/octet-stream': {
                  schema: {
                    type: 'string',
                    format: 'binary',
                  },
                },
              },
            },
            404: { description: 'Файл не найден' },
            500: { description: 'Ошибка сервера при получении' },
          },
        },
      },
    },
  },
  apis: [], // Спецификация задана вручную выше для стабильности
};

export const swaggerSpec = swaggerJSDoc(options);
