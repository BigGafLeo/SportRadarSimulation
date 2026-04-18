import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { SimulationModule } from './simulation/simulation.module';

@Module({
  imports: [AppConfigModule, SimulationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
