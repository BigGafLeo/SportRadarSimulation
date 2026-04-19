import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { SimulationModule } from './simulation/simulation.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [AppConfigModule, AuthModule, SimulationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
