import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigSchema } from './config.schema';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => {
        const parsed = ConfigSchema.safeParse(env);
        if (!parsed.success) {
          throw new Error(
            `Invalid environment configuration: ${JSON.stringify(parsed.error.format())}`,
          );
        }
        return parsed.data;
      },
    }),
  ],
})
export class AppConfigModule {}
