import { SupplyChainService } from './api/supply-chain.service';

describe('SupplyChainService', () => {
  it('returns health payload', () => {
    const service = new SupplyChainService({
      run: jest.fn(),
    } as never);

    expect(service.getHealth()).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'Blue Shark Logistics API',
      }),
    );
  });
});
