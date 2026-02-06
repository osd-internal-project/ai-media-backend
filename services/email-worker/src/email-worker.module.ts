import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';
import { EmailProcessor } from './email.processor';
import { appConfigs } from './configs';
import { EMAIL_QUEUE } from '@ai-media/share';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async () => ({
        connection: {
          host: appConfigs().REDIS_HOST,
          port: appConfigs().REDIS_PORT,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: EMAIL_QUEUE,
    }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => {
        const service = appConfigs().SMTP_SERVICE;
        const auth = {
          user: appConfigs().SMTP_USER,
          pass: appConfigs().SMTP_PASSWORD,
        };

        if (service) {
          return {
            transport: {
              service,
              auth,
            },
            defaults: { from: appConfigs().SMTP_FROM },
            template: {
              dir: join(__dirname, 'templates'),
              adapter: new HandlebarsAdapter(),
              options: { strict: true },
            },
          };
        }

        return {
          transport: {
            host: appConfigs().SMTP_HOST,
            port: Number(appConfigs().SMTP_PORT),
            auth,
          },
          defaults: { from: appConfigs().SMTP_FROM },
          template: {
            dir: join(__dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
            options: { strict: true },
          },
        };
      },
    }),
  ],
  providers: [EmailProcessor],
})
export class EmailWorkerModule { }