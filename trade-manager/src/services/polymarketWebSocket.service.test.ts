import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PolymarketWebSocketService } from './polymarketWebSocket.service.js';

describe('PolymarketWebSocketService', () => {
  let service: PolymarketWebSocketService;

  beforeEach(() => {
    service = new PolymarketWebSocketService({
      url: 'wss://test.example.com/ws/',
      reconnectInitialDelay: 100,
      reconnectMaxDelay: 1000,
    });
  });

  afterEach(() => {
    service.disconnect();
  });

  describe('Connection Management', () => {
    it('should initialize with correct config', () => {
      const customService = new PolymarketWebSocketService({
        url: 'wss://custom.example.com/',
        reconnectInitialDelay: 500,
        reconnectMaxDelay: 5000,
      });

      expect(customService).toBeDefined();
      expect(customService.isConnectionOpen()).toBe(false);
    });

    it('should use default config when not provided', () => {
      const defaultService = new PolymarketWebSocketService();
      expect(defaultService).toBeDefined();
      expect(defaultService.isConnectionOpen()).toBe(false);
    });
  });

  describe('Subscription Management', () => {
    it('should track subscribed tokens', () => {
      service.subscribeToTokens(['token1', 'token2']);

      const subscribed = service.getSubscribedTokens();
      expect(subscribed).toEqual(['token1', 'token2']);
    });

    it('should add new tokens without duplicates', () => {
      service.subscribeToTokens(['token1', 'token2']);
      service.subscribeToTokens(['token2', 'token3']);

      const subscribed = service.getSubscribedTokens();
      expect(subscribed).toHaveLength(3);
      expect(subscribed).toContain('token1');
      expect(subscribed).toContain('token2');
      expect(subscribed).toContain('token3');
    });

    it('should remove unsubscribed tokens', () => {
      service.subscribeToTokens(['token1', 'token2', 'token3']);
      service.unsubscribeFromTokens(['token2']);

      const subscribed = service.getSubscribedTokens();
      expect(subscribed).toHaveLength(2);
      expect(subscribed).toContain('token1');
      expect(subscribed).toContain('token3');
      expect(subscribed).not.toContain('token2');
    });
  });

  describe('Message Handling', () => {
    it('should be an EventEmitter', () => {
      expect(service.on).toBeDefined();
      expect(service.emit).toBeDefined();
    });

    it('should support registering event listeners', () => {
      let priceUpdateReceived = false;
      service.on('price', () => {
        priceUpdateReceived = true;
      });

      // Manually emit a price event to test listener registration
      service.emit('price', {
        tokenId: 'test',
        price: 0.5,
        timestamp: Date.now(),
      });

      expect(priceUpdateReceived).toBe(true);
    });
  });

  describe('Price Calculation', () => {
    it('should calculate mid price from best bid and ask', () => {
      const calculateMidPrice = (service as any).calculateMidPrice.bind(service);

      const buys = [{ price: '0.60', size: '100' }];
      const sells = [{ price: '0.70', size: '100' }];

      const midPrice = calculateMidPrice(buys, sells);
      expect(midPrice).toBeCloseTo(0.65, 2);
    });

    it('should use bid price if no asks available', () => {
      const calculateMidPrice = (service as any).calculateMidPrice.bind(service);

      const buys = [{ price: '0.60', size: '100' }];
      const sells: any[] = [];

      const midPrice = calculateMidPrice(buys, sells);
      expect(midPrice).toBe(0.6);
    });

    it('should use ask price if no bids available', () => {
      const calculateMidPrice = (service as any).calculateMidPrice.bind(service);

      const buys: any[] = [];
      const sells = [{ price: '0.70', size: '100' }];

      const midPrice = calculateMidPrice(buys, sells);
      expect(midPrice).toBe(0.7);
    });

    it('should return 0 if no liquidity', () => {
      const calculateMidPrice = (service as any).calculateMidPrice.bind(service);

      const buys: any[] = [];
      const sells: any[] = [];

      const midPrice = calculateMidPrice(buys, sells);
      expect(midPrice).toBe(0);
    });
  });
});
