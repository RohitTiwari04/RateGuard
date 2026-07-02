import swaggerJSDoc from 'swagger-jsdoc';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'RateGuard Distributed Rate Limiting Service API',
      version: '1.0.0',
      description: 'API Documentation for RateGuard, a production-grade distributed rate limiting system using Express, PostgreSQL, Redis, and BullMQ.',
      contact: {
        name: 'RateGuard Engineering Team',
        email: 'support@rateguard.io',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development server',
      },
      {
        url: 'http://localhost',
        description: 'NGINX Load Balancer entrypoint',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT Bearer token.',
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Provide client api-key (e.g. rg_xxx).',
        },
      },
    },
  },
  apis: ['./src/features/**/*.ts', './src/app.ts'], // Scan features and app for JSDoc annotations
};

export const swaggerSpec = swaggerJSDoc(options);
