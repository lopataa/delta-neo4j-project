import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { SupplyChainService } from '../src/api/supply-chain.service';

describe('SupplyChain API bootstrap (integration-lite)', () => {
  it('loads module and returns health payload', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const service = moduleFixture.get(SupplyChainService);

    expect(service.getHealth()).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'Blue Shark Logistics API',
      }),
    );

    await moduleFixture.close();
  });
});
