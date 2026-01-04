import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';
import { EmailProcessor } from './email.processor';
import { appConfigs } from './configs';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        transport: {
          host: appConfigs().SMTP_HOST,
          port: Number(appConfigs().SMTP_PORT),
          auth: {
            user: appConfigs().SMTP_USER,
            pass: appConfigs().SMTP_PASSWORD,
          },
        },
        defaults: { from: appConfigs().SMTP_FROM },
        template: {
          // ระวังเรื่อง Path ใน Monorepo: ใช้ process.cwd() เพื่ออ้างอิง root
          dir: join(__dirname, 'templates'),
          adapter: new HandlebarsAdapter(),
          options: { strict: true },
        },
      }),
    }),
  ],
  controllers: [EmailProcessor],
})
export class EmailWorkerModule { }