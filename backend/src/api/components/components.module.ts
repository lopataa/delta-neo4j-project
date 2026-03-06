import { Module } from '@nestjs/common';
import { ComponentsController } from './components.controller';

@Module({
  controllers: [ComponentsController],
})
export class ComponentsModule {}
