import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { redisConfigs } from 'src/configs';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: async () => {
        return new Redis({
          host: redisConfigs().redisHost,
          port: redisConfigs().redisPort,
          password: redisConfigs().redisPassword,
        });
      },
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule { }
