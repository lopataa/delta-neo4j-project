export type Product = {
  id: string;
  name: string;
  sku: string;
  price: number;
  weight: number;
  leadTime: number;
  status: 'active' | 'discontinued' | string;
  componentsCount?: number;
  supplierCount?: number;
};

export type Company = {
  id: string;
  name: string;
  type: 'supplier' | 'manufacturer' | 'distributor' | 'retailer' | 'customer' | string;
  country: string;
  coordinates: string;
  reliability: number;
};

export type LocationNode = {
  id: string;
  name: string;
  type: string;
  coordinates: string;
  capacity: number;
  connectedCount?: number;
};

export type RouteNode = {
  id: string;
  name: string;
  distance: number;
  estimatedTime: number;
  cost: number;
  reliability: number;
  locationIds?: string[];
  segmentsCount?: number;
};

export type ComponentNode = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  criticality: string;
  usedInProducts?: number;
};

export type Order = {
  id: string;
  orderDate: string;
  dueDate: string;
  quantity: number;
  status: 'pending' | 'in_transit' | 'delivered' | 'delayed' | string;
  cost: number;
  from?: Company;
  placedWith?: Company;
  route?: {
    id: string;
    name: string;
    reliability: number;
    distance?: number;
    estimatedTime?: number;
    locationIds?: string[];
  };
  items?: Array<{
    product: Product;
    quantity: number;
    unitPrice: number;
  }>;
};

export type BomEntry = {
  pathKey?: string;
  depth?: number;
  parentId?: string;
  component: {
    id: string;
    name: string;
    price: number;
    criticality: string;
  };
  quantity: number;
  position: number;
  suppliers: Array<{
    id: string;
    name: string;
    reliability: number;
    supply: {
      price: number;
      leadTime: number;
      minOrder: number;
    };
  }>;
  priceHistory?: Array<{
    date: string;
    price: number;
  }>;
  alternatives?: Array<{
    id: string;
    name: string;
    reliability: number;
    supply: {
      price: number;
      leadTime: number;
      minOrder: number;
    };
  }>;
};

export type SupplyPathResponse = {
  orderId: string;
  product: string;
  quantity: number;
  totalCost: number;
  totalDuration: string;
  riskFactors: string[];
  path: Array<{
    stage: number;
    name: string;
    company?: Company;
    location?: {
      id: string;
      name: string;
      type: string;
      country?: string;
    };
    dueDate: string;
    status: string;
    route?: {
      id: string;
      name: string;
      reliability: number;
      distance?: number;
      estimatedTime?: number;
    };
  }>;
};

export type HealthResponse = {
  kpis: {
    onTimeRate: number;
    delayedRate: number;
    avgOrderCost: number;
    totalOrders: number;
  };
  criticalComponents: Array<{
    component: {
      id: string;
      name: string;
      criticality: string;
    };
    supplierCount: number;
    riskLevel: string;
  }>;
  bottlenecks: Array<{
    location: {
      id: string;
      name: string;
      type: string;
    };
    connectionCount: number;
    routeCount: number;
    pressure: string;
  }>;
  highRiskSuppliers: Array<{
    company: Company;
    risk: number;
  }>;
  recommendations: string[];
};
