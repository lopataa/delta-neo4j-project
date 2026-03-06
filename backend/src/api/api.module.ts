import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CompaniesModule } from './companies/companies.module';
import { ComponentsModule } from './components/components.module';
import { HealthModule } from './health/health.module';
import { LocationsModule } from './locations/locations.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { RoutesModule } from './routes/routes.module';
import { SharedApiModule } from './shared/shared-api.module';

@Module({
  imports: [
    SharedApiModule,
    HealthModule,
    ProductsModule,
    ComponentsModule,
    CompaniesModule,
    LocationsModule,
    RoutesModule,
    OrdersModule,
    AnalyticsModule,
    AdminModule,
  ],
})
export class ApiModule {}
