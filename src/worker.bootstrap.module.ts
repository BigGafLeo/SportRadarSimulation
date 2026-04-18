import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { WorkerModule } from './worker/worker.module';

@Module({
  imports: [AppConfigModule, WorkerModule],
})
export class WorkerBootstrapModule {}
