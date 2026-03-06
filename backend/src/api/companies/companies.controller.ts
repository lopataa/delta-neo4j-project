import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { SupplyChainService } from '../supply-chain.service';

type MutableRecord = Record<string, unknown>;

@Controller()
export class CompaniesController {
  constructor(private readonly supplyChainService: SupplyChainService) {}

  @Get('companies')
  getCompanies() {
    return this.supplyChainService.listCompanies();
  }

  @Post('companies')
  createCompany(@Body() body: MutableRecord) {
    return this.supplyChainService.createCompany(body);
  }

  @Put('companies/:id')
  updateCompany(@Param('id') id: string, @Body() body: MutableRecord) {
    return this.supplyChainService.updateCompany(id, body);
  }

  @Delete('companies/:id')
  deleteCompany(@Param('id') id: string) {
    return this.supplyChainService.deleteCompany(id);
  }

  @Get('companies/:id/risk-assessment')
  getCompanyRiskAssessment(@Param('id') id: string) {
    return this.supplyChainService.getCompanyRiskAssessment(id);
  }
}
