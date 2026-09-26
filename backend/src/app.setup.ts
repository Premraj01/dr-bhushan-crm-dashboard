import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { SocketIoAdapter } from './realtime/socket-io.adapter';

/** Shared by main.ts and the e2e tests so both run the same HTTP/WS pipeline. */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const origins = config
    .getOrThrow<string>('CORS_ORIGIN')
    .split(',')
    .map((o) => o.trim());

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({ origin: origins, credentials: true });
  app.useWebSocketAdapter(new SocketIoAdapter(app, origins));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Dr. Bhushan’s Rejuvenation CRM API')
      .setDescription(
        'REST API for the clinic CRM. Realtime updates are on the socket.io `/realtime` namespace.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
}
