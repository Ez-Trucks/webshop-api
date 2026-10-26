import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { allowedOrigins, originAllowed } from './operations/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(json({ limit: '30mb' }));
  app.use(urlencoded({ extended: true, limit: '30mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origins = allowedOrigins();
  app.enableCors({
    origin: (origin, callback) => callback(null, originAllowed(origin, origins)),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`API luistert op poort ${port}`);
}

bootstrap();
