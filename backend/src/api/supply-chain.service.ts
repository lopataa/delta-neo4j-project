import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Neo4jHttpService } from './neo4j-http.service';

type JsonRecord = Record<string, unknown>;

type ProductRecord = {
  id: string;
  name: string;
  sku: string;
  price: number;
  weight: number;
  leadTime: number;
  status: string;
  componentsCount?: number;
  supplierCount?: number;
};

type CompanyRecord = {
  id: string;
  name: string;
  type: string;
  country: string;
  coordinates: string;
  reliability: number;
};

type LocationRecord = {
  id: string;
  name: string;
  type: string;
  coordinates: string;
  capacity: number;
  connectedCount?: number;
};

type RouteRecord = {
  id: string;
  name: string;
  distance: number;
  estimatedTime: number;
  cost: number;
  reliability: number;
  locationIds?: string[];
  segmentsCount?: number;
};

type OrderItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

type OrderRecord = {
  id: string;
  orderDate: string;
  dueDate: string;
  quantity: number;
  status: string;
  cost: number;
};

type ComponentRecord = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  criticality: string;
  usedInProducts?: number;
};

type Neo4jCountResponse = {
  count: number;
};

@Injectable()
export class SupplyChainService {
  constructor(private readonly neo4j: Neo4jHttpService) {}

  getHealth(): JsonRecord {
    return {
      status: 'ok',
      service: 'Blue Shark Logistics API',
      timestamp: new Date().toISOString(),
      database: 'neo4j',
    };
  }

  async listProducts(): Promise<ProductRecord[]> {
    return this.neo4j.run<ProductRecord>(`
      MATCH (p:Product)
      OPTIONAL MATCH (p)-[:COMPOSED_OF*1..8]->(component:Component)
      OPTIONAL MATCH (component)-[:SUPPLIED_BY]->(supplier:Company)
      WITH p,
           count(DISTINCT component) AS componentsCount,
           count(DISTINCT supplier) AS supplierCount
      RETURN p{
        .*,
        componentsCount: componentsCount,
        supplierCount: supplierCount
      } AS product
      ORDER BY p.name ASC
    `);
  }

  async createProduct(input: JsonRecord): Promise<ProductRecord> {
    const payload = this.normalizeProductInput(input);

    const rows = await this.neo4j.run<ProductRecord>(
      `
      MERGE (p:Product {id: $id})
      SET p += $payload
      RETURN p{.*} AS product
    `,
      {
        id: payload.id,
        payload,
      },
    );

    return this.ensureRecord(rows[0], 'Product could not be created');
  }

  async updateProduct(id: string, input: JsonRecord): Promise<ProductRecord> {
    const payload = this.normalizeProductInput({ ...input, id }, true);

    const rows = await this.neo4j.run<ProductRecord>(
      `
      MATCH (p:Product {id: $id})
      SET p += $payload
      RETURN p{.*} AS product
    `,
      {
        id,
        payload,
      },
    );

    if (!rows[0]) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    return rows[0];
  }

  async deleteProduct(id: string): Promise<JsonRecord> {
    const rows = await this.neo4j.run<Neo4jCountResponse>(
      `
      MATCH (p:Product {id: $id})
      DETACH DELETE p
      RETURN 1 AS count
    `,
      { id },
    );

    return {
      deleted: Boolean(rows[0]?.count),
      id,
    };
  }

  async getProductById(id: string): Promise<ProductRecord> {
    const rows = await this.neo4j.run<ProductRecord>(
      `
      MATCH (p:Product {id: $id})
      OPTIONAL MATCH (p)-[:COMPOSED_OF*1..8]->(component:Component)
      OPTIONAL MATCH (component)-[:SUPPLIED_BY]->(supplier:Company)
      WITH p,
           count(DISTINCT component) AS componentsCount,
           count(DISTINCT supplier) AS supplierCount
      RETURN p{
        .*,
        componentsCount: componentsCount,
        supplierCount: supplierCount
      } AS product
      LIMIT 1
    `,
      { id },
    );

    if (!rows[0]) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    return rows[0];
  }

  async listCompanies(): Promise<CompanyRecord[]> {
    return this.neo4j.run<CompanyRecord>(`
      MATCH (c:Company)
      RETURN c{.*} AS company
      ORDER BY c.name ASC
    `);
  }

  async listComponents(): Promise<ComponentRecord[]> {
    return this.neo4j.run<ComponentRecord>(`
      MATCH (component:Component)
      OPTIONAL MATCH (product:Product)-[:COMPOSED_OF*1..8]->(component)
      RETURN component{
        .*,
        usedInProducts: count(DISTINCT product)
      } AS component
      ORDER BY component.name ASC
    `);
  }

  async listLocations(): Promise<LocationRecord[]> {
    return this.neo4j.run<LocationRecord>(`
      MATCH (location:Location)
      OPTIONAL MATCH (location)-[connection:CONNECTED_TO]-(:Location)
      RETURN location{
        .*,
        connectedCount: count(connection)
      } AS location
      ORDER BY location.name ASC
    `);
  }

  async createLocation(input: JsonRecord): Promise<LocationRecord> {
    const payload = this.normalizeLocationInput(input);

    const rows = await this.neo4j.run<LocationRecord>(
      `
      MERGE (location:Location {id: $id})
      SET location += $payload
      RETURN location{
        .*,
        connectedCount: size((location)-[:CONNECTED_TO]-())
      } AS location
    `,
      {
        id: payload.id,
        payload,
      },
    );

    return this.ensureRecord(rows[0], 'Location could not be created');
  }

  async listRoutes(): Promise<RouteRecord[]> {
    return this.neo4j.run<RouteRecord>(`
      MATCH (route:Route)
      OPTIONAL MATCH (from:Location)-[segment:CONNECTED_TO {routeId: route.id}]->(to:Location)
      WITH route, from, to, segment
      ORDER BY coalesce(segment.leg, 0) ASC, from.name ASC, to.name ASC
      WITH route,
           collect(
             CASE
               WHEN segment IS NULL THEN NULL
               ELSE {
                 fromId: from.id,
                 toId: to.id,
                 leg: coalesce(segment.leg, 0)
               }
             END
           ) AS rawSegments
      WITH route, [segment IN rawSegments WHERE segment IS NOT NULL] AS segments
      RETURN route{
        .*,
        segmentsCount: size(segments),
        locationIds: CASE
          WHEN size(segments) = 0 THEN []
          ELSE [segments[0].fromId] + [segment IN segments | segment.toId]
        END
      } AS route
      ORDER BY route.name ASC
    `);
  }

  async createRoute(input: JsonRecord): Promise<RouteRecord> {
    const payload = this.normalizeRouteInput(input);
    const locationIds = this.normalizeLocationPathInput(input.locationIds);

    if (locationIds.length < 2) {
      throw new BadRequestException(
        'Route requires at least two location IDs to build a path',
      );
    }

    await this.assertRoutePathLocationsExist(locationIds);
    await this.saveRouteWithPath(payload, locationIds);

    return this.getRouteById(payload.id);
  }

  async updateRoute(routeId: string, input: JsonRecord): Promise<RouteRecord> {
    const existing = await this.getRouteById(routeId);
    const requestedPath = this.normalizeLocationPathInput(input.locationIds);
    const locationIds =
      requestedPath.length >= 2 ? requestedPath : (existing.locationIds ?? []);

    if (locationIds.length < 2) {
      throw new BadRequestException(
        'Updated route requires at least two location IDs',
      );
    }

    const payload = this.normalizeRouteInput({
      id: routeId,
      name: input.name ?? existing.name,
      distance: input.distance ?? existing.distance,
      estimatedTime:
        input.estimatedTime ?? input.time ?? existing.estimatedTime,
      cost: input.cost ?? existing.cost,
      reliability: input.reliability ?? existing.reliability,
    });

    await this.assertRoutePathLocationsExist(locationIds);
    await this.saveRouteWithPath(payload, locationIds);

    return this.getRouteById(routeId);
  }

  async deleteRoute(routeId: string): Promise<JsonRecord> {
    const rows = await this.neo4j.run<Neo4jCountResponse>(
      `
      MATCH (route:Route {id: $routeId})
      WITH route
      OPTIONAL MATCH (:Location)-[segment:CONNECTED_TO {routeId: $routeId}]->(:Location)
      DELETE segment
      WITH route
      DETACH DELETE route
      RETURN 1 AS count
    `,
      { routeId },
    );

    if (this.toNumber(rows[0]?.count, 0) === 0) {
      throw new NotFoundException(`Route ${routeId} not found`);
    }

    return {
      deleted: true,
      id: routeId,
    };
  }

  async createCompany(input: JsonRecord): Promise<CompanyRecord> {
    const payload = this.normalizeCompanyInput(input);

    const rows = await this.neo4j.run<CompanyRecord>(
      `
      MERGE (c:Company {id: $id})
      SET c += $payload
      RETURN c{.*} AS company
    `,
      {
        id: payload.id,
        payload,
      },
    );

    return this.ensureRecord(rows[0], 'Company could not be created');
  }

  async updateCompany(id: string, input: JsonRecord): Promise<CompanyRecord> {
    const payload = this.normalizeCompanyInput({ ...input, id }, true);

    const rows = await this.neo4j.run<CompanyRecord>(
      `
      MATCH (c:Company {id: $id})
      SET c += $payload
      RETURN c{.*} AS company
    `,
      {
        id,
        payload,
      },
    );

    if (!rows[0]) {
      throw new NotFoundException(`Company ${id} not found`);
    }

    return rows[0];
  }

  async deleteCompany(id: string): Promise<JsonRecord> {
    const rows = await this.neo4j.run<Neo4jCountResponse>(
      `
      MATCH (c:Company {id: $id})
      DETACH DELETE c
      RETURN 1 AS count
    `,
      { id },
    );

    return {
      deleted: Boolean(rows[0]?.count),
      id,
    };
  }

  async listOrders(): Promise<JsonRecord[]> {
    return this.neo4j.run<JsonRecord>(`
      MATCH (o:Order)
      OPTIONAL MATCH (o)-[:FROM]->(customer:Company)
      OPTIONAL MATCH (o)-[:PLACED_WITH]->(vendor:Company)
      OPTIONAL MATCH (o)-[:SHIPPED_VIA]->(route:Route)
      OPTIONAL MATCH (o)-[contains:CONTAINS]->(product:Product)
      WITH o, customer, vendor, route,
           collect(
             CASE
               WHEN product IS NULL THEN NULL
               ELSE {
                 product: product{.*},
                 quantity: contains.quantity,
                 unitPrice: contains.unitPrice
               }
             END
           ) AS rawItems
      RETURN o{
        .*,
        from: customer{.*},
        placedWith: vendor{.*},
        route: route{.*},
        items: [item IN rawItems WHERE item IS NOT NULL]
      } AS order
      ORDER BY o.orderDate DESC
    `);
  }

  async createOrder(input: JsonRecord): Promise<JsonRecord> {
    const payload = this.normalizeOrderInput(input);

    const orderRows = await this.neo4j.run<JsonRecord>(
      `
      MERGE (o:Order {id: $id})
      SET o += $payload
      RETURN o{.*} AS order
    `,
      {
        id: payload.id,
        payload,
      },
    );

    if (!orderRows[0]) {
      throw new BadRequestException('Order could not be created');
    }

    const fromCompanyId = this.optionalString(input.fromCompanyId);
    if (fromCompanyId) {
      await this.linkOrderToCompany(payload.id, fromCompanyId, 'FROM');
    }

    const placedWithCompanyId = this.optionalString(input.placedWithCompanyId);
    if (placedWithCompanyId) {
      await this.linkOrderToCompany(
        payload.id,
        placedWithCompanyId,
        'PLACED_WITH',
      );
    }

    const routeId = this.optionalString(input.routeId);
    if (routeId) {
      await this.linkOrderToRoute(payload.id, routeId);
    }

    const items = this.normalizeOrderItems(input.items);
    for (const item of items) {
      await this.neo4j.run(
        `
        MATCH (o:Order {id: $orderId})
        MATCH (p:Product {id: $productId})
        MERGE (o)-[rel:CONTAINS]->(p)
        SET rel.quantity = $quantity,
            rel.unitPrice = $unitPrice
      `,
        {
          orderId: payload.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        },
      );
    }

    return this.getOrderById(payload.id);
  }

  async deleteOrder(id: string): Promise<JsonRecord> {
    const rows = await this.neo4j.run<Neo4jCountResponse>(
      `
      MATCH (o:Order {id: $id})
      DETACH DELETE o
      RETURN 1 AS count
    `,
      { id },
    );

    return {
      deleted: Boolean(rows[0]?.count),
      id,
    };
  }

  async updateOrderStatus(
    id: string,
    statusValue: string,
  ): Promise<JsonRecord> {
    const status = this.normalizeStatus(statusValue, [
      'pending',
      'in_transit',
      'delivered',
      'delayed',
    ]);

    const rows = await this.neo4j.run<JsonRecord>(
      `
      MATCH (o:Order {id: $id})
      SET o.status = $status
      RETURN o{.*} AS order
    `,
      {
        id,
        status,
      },
    );

    if (!rows[0]) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return rows[0];
  }

  async getOrderById(orderId: string): Promise<JsonRecord> {
    const rows = await this.neo4j.run<JsonRecord>(
      `
      MATCH (o:Order {id: $orderId})
      OPTIONAL MATCH (o)-[:FROM]->(customer:Company)
      OPTIONAL MATCH (o)-[:PLACED_WITH]->(vendor:Company)
      OPTIONAL MATCH (o)-[:SHIPPED_VIA]->(route:Route)
      OPTIONAL MATCH (o)-[contains:CONTAINS]->(product:Product)
      WITH o, customer, vendor, route,
           collect(
             CASE
               WHEN product IS NULL THEN NULL
               ELSE {
                 product: product{.*},
                 quantity: contains.quantity,
                 unitPrice: contains.unitPrice
               }
             END
           ) AS rawItems
      RETURN o{
        .*,
        from: customer{.*},
        placedWith: vendor{.*},
        route: route{.*},
        items: [item IN rawItems WHERE item IS NOT NULL]
      } AS order
      LIMIT 1
    `,
      { orderId },
    );

    if (!rows[0]) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    return rows[0];
  }

  async getBom(productId: string): Promise<JsonRecord> {
    const rows = await this.neo4j.run<JsonRecord>(
      `
      MATCH (p:Product {id: $productId})
      OPTIONAL MATCH (p)-[bom:COMPOSED_OF]->(component:Component)
      WITH p, bom, component
      OPTIONAL MATCH (component)-[sup:SUPPLIED_BY]->(supplier:Company)
      WITH p, bom, component,
           collect(
             CASE
               WHEN supplier IS NULL THEN NULL
               ELSE supplier{
                 .*,
                 supply: {
                   price: sup.price,
                   leadTime: sup.leadTime,
                   minOrder: sup.minOrder
                 }
               }
             END
           ) AS rawSuppliers
      WITH p,
           collect(
             CASE
               WHEN component IS NULL THEN NULL
               ELSE {
                 component: component{.*},
                 quantity: bom.quantity,
                 position: bom.position,
                 suppliers: [entry IN rawSuppliers WHERE entry IS NOT NULL]
               }
             END
           ) AS rawComponents
      RETURN {
        product: p{.*},
        components: [entry IN rawComponents WHERE entry IS NOT NULL]
      } AS bom
      LIMIT 1
    `,
      { productId },
    );

    if (!rows[0]) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    return rows[0];
  }

  async getBomTree(productId: string): Promise<JsonRecord> {
    const rows = await this.neo4j.run<JsonRecord>(
      `
      MATCH (p:Product {id: $productId})
      OPTIONAL MATCH path = (p)-[bomPath:COMPOSED_OF*1..8]->(component:Component)
      WITH p, path, bomPath, component
      OPTIONAL MATCH (component)-[sup:SUPPLIED_BY]->(supplier:Company)
      WITH p,
           path,
           component,
           bomPath,
           collect(
             CASE
               WHEN supplier IS NULL THEN NULL
               ELSE supplier{
                 .*,
                 supply: {
                   price: sup.price,
                   leadTime: sup.leadTime,
                   minOrder: sup.minOrder
                 }
               }
             END
           ) AS rawSuppliers
      WITH p,
           collect(
             CASE
               WHEN component IS NULL OR path IS NULL THEN NULL
               ELSE {
                 pathKey: reduce(key = '', rel IN relationships(path) | key + ':' + toString(id(rel))),
                 depth: length(path),
                 parentId: nodes(path)[length(path) - 1].id,
                 component: component{.*},
                 quantity: coalesce(last(bomPath).quantity, 1),
                 position: coalesce(last(bomPath).position, 1),
                 suppliers: [entry IN rawSuppliers WHERE entry IS NOT NULL]
               }
             END
           ) AS rawComponents
      RETURN {
        product: p{.*},
        components: [entry IN rawComponents WHERE entry IS NOT NULL]
      } AS bom
      LIMIT 1
    `,
      { productId },
    );

    if (!rows[0]) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    return rows[0];
  }

  async getDetailedBom(productId: string): Promise<JsonRecord> {
    const bom = (await this.getBom(productId)) as {
      product: ProductRecord;
      components: Array<{
        component: JsonRecord;
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
      }>;
    };

    const enhancedComponents = bom.components.map((entry) => {
      const suppliers = [...entry.suppliers].sort((left, right) => {
        const leftReliability = this.toNumber(left.reliability, 0.8);
        const rightReliability = this.toNumber(right.reliability, 0.8);
        const leftPrice = this.toNumber(left.supply?.price, 0);
        const rightPrice = this.toNumber(right.supply?.price, 0);
        const leftLeadTime = this.toNumber(left.supply?.leadTime, 14);
        const rightLeadTime = this.toNumber(right.supply?.leadTime, 14);

        const leftScore =
          leftPrice * 0.45 + leftLeadTime * 2.5 - leftReliability * 40;
        const rightScore =
          rightPrice * 0.45 + rightLeadTime * 2.5 - rightReliability * 40;

        return leftScore - rightScore;
      });

      const cheapest = suppliers[0]?.supply?.price
        ? this.toNumber(suppliers[0].supply.price)
        : this.toNumber(entry.component.price, 0);

      const priceHistory = this.buildPriceHistory(cheapest);

      return {
        ...entry,
        priceHistory,
        alternatives: suppliers.slice(1),
      };
    });

    return {
      product: bom.product,
      generatedAt: new Date().toISOString(),
      components: enhancedComponents,
    };
  }

  async addComponentToBom(
    productId: string,
    input: JsonRecord,
  ): Promise<JsonRecord> {
    const componentPayload = this.normalizeComponentInput(input);

    await this.ensureProductExists(productId);

    const rows = await this.neo4j.run<JsonRecord>(
      `
      MATCH (p:Product {id: $productId})
      MERGE (c:Component {id: $componentId})
      SET c += $componentPayload
      MERGE (p)-[rel:COMPOSED_OF]->(c)
      SET rel.quantity = $quantity,
          rel.position = $position
      RETURN {
        component: c{.*},
        quantity: rel.quantity,
        position: rel.position
      } AS relation
    `,
      {
        productId,
        componentId: componentPayload.id,
        componentPayload,
        quantity: this.toNumber(input.quantity, componentPayload.quantity),
        position: this.toNumber(input.position, 1),
      },
    );

    const suppliers = this.normalizeSuppliersInput(input.suppliers);
    if (suppliers.length > 0) {
      await this.neo4j.run(
        `
        UNWIND $suppliers AS supplier
        MATCH (component:Component {id: $componentId})
        MATCH (company:Company {id: supplier.companyId})
        MERGE (component)-[rel:SUPPLIED_BY]->(company)
        SET rel.price = supplier.price,
            rel.leadTime = supplier.leadTime,
            rel.minOrder = supplier.minOrder
      `,
        {
          componentId: componentPayload.id,
          suppliers,
        },
      );
    }

    return this.ensureRecord(rows[0], 'Component could not be added to BOM');
  }

  async updateBomComponent(
    productId: string,
    componentId: string,
    input: JsonRecord,
  ): Promise<JsonRecord> {
    const componentPayload = this.normalizeComponentInput({
      ...input,
      id: componentId,
    });

    const rows = await this.neo4j.run<JsonRecord>(
      `
      MATCH (p:Product {id: $productId})-[rel:COMPOSED_OF]->(component:Component {id: $componentId})
      SET rel.quantity = $quantity,
          rel.position = $position,
          component += $componentPayload
      RETURN {
        component: component{.*},
        quantity: rel.quantity,
        position: rel.position
      } AS relation
    `,
      {
        productId,
        componentId,
        quantity: this.toNumber(input.quantity, componentPayload.quantity),
        position: this.toNumber(input.position, 1),
        componentPayload,
      },
    );

    if (!rows[0]) {
      throw new NotFoundException(
        `BOM relation ${productId} -> ${componentId} not found`,
      );
    }

    const suppliers = this.normalizeSuppliersInput(input.suppliers);
    if (suppliers.length > 0) {
      await this.neo4j.run(
        `
        UNWIND $suppliers AS supplier
        MATCH (component:Component {id: $componentId})
        MATCH (company:Company {id: supplier.companyId})
        MERGE (component)-[rel:SUPPLIED_BY]->(company)
        SET rel.price = supplier.price,
            rel.leadTime = supplier.leadTime,
            rel.minOrder = supplier.minOrder
      `,
        {
          componentId,
          suppliers,
        },
      );
    }

    return rows[0];
  }

  async deleteBomComponent(
    productId: string,
    componentId: string,
  ): Promise<JsonRecord> {
    const rows = await this.neo4j.run<Neo4jCountResponse>(
      `
      MATCH (:Product {id: $productId})-[rel:COMPOSED_OF]->(component:Component {id: $componentId})
      DELETE rel
      RETURN 1 AS count
    `,
      {
        productId,
        componentId,
      },
    );

    if (!rows[0]?.count) {
      throw new NotFoundException(
        `BOM relation ${productId} -> ${componentId} not found`,
      );
    }

    await this.neo4j.run(
      `
      MATCH (component:Component {id: $componentId})
      WHERE NOT (:Product)-[:COMPOSED_OF*1..8]->(component)
      DETACH DELETE component
    `,
      { componentId },
    );

    return {
      deleted: true,
      productId,
      componentId,
    };
  }

  async getOrderSupplyPath(orderId: string): Promise<JsonRecord> {
    const rows = await this.neo4j.run<JsonRecord>(
      `
      MATCH (o:Order {id: $orderId})
      OPTIONAL MATCH (o)-[:PLACED_WITH]->(source:Company)
      OPTIONAL MATCH (o)-[:FROM]->(customer:Company)
      OPTIONAL MATCH (source)-[:LOCATED_AT]->(sourceLocation:Location)
      OPTIONAL MATCH (customer)-[:LOCATED_AT]->(customerLocation:Location)
      OPTIONAL MATCH (o)-[shipment:SHIPPED_VIA]->(route:Route)
      OPTIONAL MATCH (o)-[contains:CONTAINS]->(product:Product)
      WITH o, source, customer, sourceLocation, customerLocation, route, shipment,
           collect(
             CASE
               WHEN product IS NULL THEN NULL
               ELSE {
                 id: product.id,
                 name: product.name,
                 quantity: contains.quantity,
                 unitPrice: contains.unitPrice
               }
             END
           ) AS products
      RETURN {
        order: o{.*},
        source: source{.*},
        customer: customer{.*},
        sourceLocation: sourceLocation{.*},
        customerLocation: customerLocation{.*},
        route: route{.*},
        shipment: shipment{.*},
        products: [item IN products WHERE item IS NOT NULL]
      } AS supply
      LIMIT 1
    `,
      { orderId },
    );

    const supply = rows[0] as
      | {
          order: JsonRecord;
          source?: JsonRecord;
          customer?: JsonRecord;
          sourceLocation?: JsonRecord;
          customerLocation?: JsonRecord;
          route?: JsonRecord;
          shipment?: JsonRecord;
          products: JsonRecord[];
        }
      | undefined;

    if (!supply) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const orderStatus = this.optionalString(supply.order.status) ?? 'pending';

    const stages = [
      {
        stage: 1,
        name: 'Source',
        company: supply.source ?? null,
        location: supply.sourceLocation ?? null,
        dueDate: supply.order.dueDate,
        status: orderStatus === 'pending' ? 'planning' : 'completed',
      },
      {
        stage: 2,
        name: 'Transport',
        company: null,
        location: null,
        route: supply.route ?? null,
        dueDate: supply.shipment?.arrivalDate ?? supply.order.dueDate,
        status:
          orderStatus === 'in_transit'
            ? 'active'
            : orderStatus === 'delivered'
              ? 'completed'
              : 'waiting',
      },
      {
        stage: 3,
        name: 'Destination',
        company: supply.customer ?? null,
        location: supply.customerLocation ?? null,
        dueDate: supply.order.dueDate,
        status: orderStatus,
      },
    ];

    const routeReliability = this.toNumber(supply.route?.reliability, 0.9);
    const sourceReliability = this.toNumber(supply.source?.reliability, 0.9);

    const riskFactors: string[] = [];
    if (routeReliability < 0.88) {
      riskFactors.push('Route reliability is below 0.88.');
    }
    if (sourceReliability < 0.9) {
      riskFactors.push('Supplier reliability is below 0.90.');
    }
    if (orderStatus === 'delayed') {
      riskFactors.push('Order already marked as delayed.');
    }
    if (riskFactors.length === 0) {
      riskFactors.push('No immediate red flags detected.');
    }

    return {
      orderId,
      product: supply.products[0]?.name ?? null,
      quantity: this.toNumber(supply.order.quantity, 0),
      totalCost: this.toNumber(supply.order.cost, 0),
      path: stages,
      totalDuration: `${Math.max(
        2,
        Math.round(
          this.toNumber(supply.route?.estimatedTime, 0) ||
            this.toNumber(supply.route?.distance, 0) / 80,
        ),
      )} days`,
      riskFactors,
      products: supply.products,
    };
  }

  async getOptimalRoutes(
    from: string,
    to: string,
    weight: number,
    optimize: string,
  ): Promise<JsonRecord[]> {
    if (!from || !to) {
      throw new BadRequestException(
        'Both "from" and "to" location ids are required',
      );
    }

    const normalizedOptimize = this.normalizeStatus(optimize, [
      'balanced',
      'time',
      'cost',
    ]);

    return this.neo4j.run<JsonRecord>(
      `
      MATCH (from:Location {id: $from})
      MATCH (to:Location {id: $to})
      MATCH path = (from)-[segments:CONNECTED_TO*1..5]->(to)
      WITH path,
           reduce(distance = 0.0, segment IN segments | distance + coalesce(segment.distance, 0.0)) AS distance,
           reduce(time = 0.0, segment IN segments | time + coalesce(segment.time, 0.0)) AS time,
           reduce(cost = 0.0, segment IN segments | cost + coalesce(segment.cost, 0.0)) AS baseCost,
           reduce(rel = 1.0, segment IN segments | rel * coalesce(segment.reliability, 1.0)) AS reliability,
           [segment IN segments | segment{.*}] AS segmentDetails,
           [node IN nodes(path) | node{.*}] AS locationChain
      WITH *,
           baseCost + ($weight * distance * 0.0008) AS weightedCost,
           CASE $optimize
             WHEN 'time' THEN time
             WHEN 'cost' THEN baseCost + ($weight * distance * 0.0008)
             ELSE (time * 0.45) + ((baseCost + ($weight * distance * 0.0008)) * 0.35) + (distance * 0.2) - (reliability * 15.0)
           END AS score
      ORDER BY score ASC
      LIMIT 3
      RETURN {
        route: locationChain,
        segments: segmentDetails,
        distance: round(distance * 100) / 100,
        time: round(time * 100) / 100,
        cost: round(weightedCost * 100) / 100,
        reliability: round(reliability * 1000) / 1000,
        optimizeBy: $optimize
      } AS result
    `,
      {
        from,
        to,
        weight,
        optimize: normalizedOptimize,
      },
    );
  }

  async getCompanyRiskAssessment(companyId: string): Promise<JsonRecord> {
    const companyRows = await this.neo4j.run<CompanyRecord>(
      `
      MATCH (c:Company {id: $companyId})
      RETURN c{.*} AS company
      LIMIT 1
    `,
      { companyId },
    );

    const company = companyRows[0];
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    const orderStatsRows = await this.neo4j.run<{
      totalOrders: number;
      deliveredOrders: number;
      delayedOrders: number;
    }>(
      `
      MATCH (o:Order)-[:PLACED_WITH]->(c:Company {id: $companyId})
      RETURN count(o) AS totalOrders,
             sum(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) AS deliveredOrders,
             sum(CASE WHEN o.status = 'delayed' THEN 1 ELSE 0 END) AS delayedOrders
    `,
      { companyId },
    );

    const impactRows = await this.neo4j.run<{
      productId: string;
      productName: string;
      componentId: string;
      componentName: string;
      criticality: string;
      alternatives: number;
    }>(
      `
      MATCH (supplier:Company {id: $companyId})<-[:SUPPLIED_BY]-(component:Component)<-[:COMPOSED_OF*1..8]-(product:Product)
      WITH DISTINCT supplier, component, product
      OPTIONAL MATCH (component)-[:SUPPLIED_BY]->(alternative:Company)
      WHERE alternative.id <> supplier.id
      RETURN product.id AS productId,
             product.name AS productName,
             component.id AS componentId,
             component.name AS componentName,
             component.criticality AS criticality,
             count(DISTINCT alternative) AS alternatives
      ORDER BY product.name ASC, component.name ASC
    `,
      { companyId },
    );

    const totals = orderStatsRows[0] ?? {
      totalOrders: 0,
      deliveredOrders: 0,
      delayedOrders: 0,
    };

    const reliabilityScore = this.toNumber(company.reliability, 0.85);
    const onTimeDeliveryRate =
      totals.totalOrders === 0
        ? 0.85
        : totals.deliveredOrders / totals.totalOrders;
    const delayedRate =
      totals.totalOrders === 0 ? 0 : totals.delayedOrders / totals.totalOrders;

    const totalAlternatives = impactRows.reduce(
      (sum, row) => sum + this.toNumber(row.alternatives, 0),
      0,
    );

    const averageAlternatives =
      impactRows.length === 0 ? 2 : totalAlternatives / impactRows.length;

    const geopoliticalRisk = this.countryRiskFactor(company.country);
    const qualityIssues = Math.min(
      0.6,
      delayedRate * 0.5 + (1 - reliabilityScore) * 0.25,
    );
    const financialStability = Math.max(
      0.2,
      Math.min(0.99, reliabilityScore * 0.7 + onTimeDeliveryRate * 0.3),
    );

    const riskScore = Math.max(
      0,
      Math.min(
        1,
        (1 - reliabilityScore) * 0.36 +
          (1 - onTimeDeliveryRate) * 0.32 +
          geopoliticalRisk * 0.2 +
          (averageAlternatives < 1.4 ? 0.12 : 0.03),
      ),
    );

    const criticalFor = impactRows.map((row) => ({
      product: row.productName,
      component: row.componentName,
      impact:
        row.criticality === 'high' || this.toNumber(row.alternatives, 0) === 0
          ? 'high'
          : this.toNumber(row.alternatives, 0) <= 2
            ? 'medium'
            : 'low',
      alternatives: this.toNumber(row.alternatives, 0),
    }));

    const recommendations = this.generateSupplierRecommendations({
      riskScore,
      onTimeDeliveryRate,
      reliabilityScore,
      alternatives: averageAlternatives,
      geopoliticalRisk,
    });

    return {
      supplierId: company.id,
      company: company.name,
      riskScore: Number(riskScore.toFixed(3)),
      factors: {
        reliabilityScore: Number(reliabilityScore.toFixed(3)),
        onTimeDeliveryRate: Number(onTimeDeliveryRate.toFixed(3)),
        qualityIssues: Number(qualityIssues.toFixed(3)),
        geopoliticalRisk: Number(geopoliticalRisk.toFixed(3)),
        financialStability: Number(financialStability.toFixed(3)),
      },
      criticalFor,
      recommendations,
    };
  }

  async getSupplyChainHealth(): Promise<JsonRecord> {
    const kpiRows = await this.neo4j.run<{
      totalOrders: number;
      delivered: number;
      delayed: number;
      avgCost: number;
    }>(`
      MATCH (o:Order)
      RETURN count(o) AS totalOrders,
             sum(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
             sum(CASE WHEN o.status = 'delayed' THEN 1 ELSE 0 END) AS delayed,
             avg(coalesce(o.cost, 0)) AS avgCost
    `);

    const criticalComponents = await this.neo4j.run<JsonRecord>(`
      MATCH (component:Component)
      OPTIONAL MATCH (component)-[:SUPPLIED_BY]->(supplier:Company)
      WITH component, count(DISTINCT supplier) AS supplierCount
      WHERE component.criticality = 'high' OR supplierCount <= 1
      RETURN {
        component: component{.*},
        supplierCount: supplierCount,
        riskLevel:
          CASE
            WHEN supplierCount = 0 THEN 'very_high'
            WHEN supplierCount = 1 THEN 'high'
            WHEN component.criticality = 'high' THEN 'medium'
            ELSE 'low'
          END
      } AS item
      ORDER BY supplierCount ASC
      LIMIT 8
    `);

    const bottlenecks = await this.neo4j.run<JsonRecord>(`
      MATCH (location:Location)
      OPTIONAL MATCH (location)-[connection:CONNECTED_TO]-(:Location)
      OPTIONAL MATCH (:Company)-[:LOCATED_AT]->(location)
      WITH location,
           count(DISTINCT connection) AS connectionCount,
           count(DISTINCT location.id) AS locationCount,
           count(DISTINCT connection.routeId) AS routeCount
      RETURN {
        location: location{.*},
        connectionCount: connectionCount,
        routeCount: routeCount,
        pressure:
          CASE
            WHEN connectionCount <= 1 THEN 'high'
            WHEN connectionCount = 2 THEN 'medium'
            ELSE 'low'
          END
      } AS item
      ORDER BY connectionCount ASC
      LIMIT 6
    `);

    const highRiskSuppliers = await this.neo4j.run<JsonRecord>(`
      MATCH (company:Company)
      WHERE company.type IN ['supplier', 'manufacturer', 'distributor']
      RETURN {
        company: company{.*},
        risk: round((1 - coalesce(company.reliability, 0.85)) * 1000) / 1000
      } AS item
      ORDER BY company.reliability ASC
      LIMIT 8
    `);

    const kpis = kpiRows[0] ?? {
      totalOrders: 0,
      delivered: 0,
      delayed: 0,
      avgCost: 0,
    };

    const onTimeRate =
      this.toNumber(kpis.totalOrders, 0) === 0
        ? 0
        : this.toNumber(kpis.delivered, 0) / this.toNumber(kpis.totalOrders, 1);

    const delayedRate =
      this.toNumber(kpis.totalOrders, 0) === 0
        ? 0
        : this.toNumber(kpis.delayed, 0) / this.toNumber(kpis.totalOrders, 1);

    const recommendations: string[] = [];
    if (delayedRate > 0.2) {
      recommendations.push(
        'Increase safety stock for critical SKUs by 15-20%.',
      );
    }
    if (criticalComponents.length > 3) {
      recommendations.push(
        'Qualify at least one backup supplier for high-risk components.',
      );
    }
    if (highRiskSuppliers.length > 2) {
      recommendations.push('Renegotiate SLAs with low-reliability suppliers.');
    }
    if (recommendations.length === 0) {
      recommendations.push(
        'Current network health is stable. Keep weekly monitoring cadence.',
      );
    }

    return {
      kpis: {
        onTimeRate: Number(onTimeRate.toFixed(3)),
        delayedRate: Number(delayedRate.toFixed(3)),
        avgOrderCost: Number(this.toNumber(kpis.avgCost, 0).toFixed(2)),
        totalOrders: this.toNumber(kpis.totalOrders, 0),
      },
      criticalComponents,
      bottlenecks,
      highRiskSuppliers,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  }

  async getAlternativeSuppliers(productId: string): Promise<JsonRecord> {
    await this.ensureProductExists(productId);

    const rows = await this.neo4j.run<{
      componentId: string;
      componentName: string;
      suppliers: Array<{
        company: JsonRecord;
        price: number;
        leadTime: number;
        minOrder: number;
      }>;
    }>(
      `
      MATCH (p:Product {id: $productId})-[:COMPOSED_OF*1..8]->(component:Component)
      WITH DISTINCT component
      OPTIONAL MATCH (component)-[sup:SUPPLIED_BY]->(company:Company)
      WITH component,
           collect(
             CASE
               WHEN company IS NULL THEN NULL
               ELSE {
                 company: company{.*},
                 price: sup.price,
                 leadTime: sup.leadTime,
                 minOrder: sup.minOrder
               }
             END
           ) AS rawSuppliers
      RETURN component.id AS componentId,
             component.name AS componentName,
             [entry IN rawSuppliers WHERE entry IS NOT NULL] AS suppliers
      ORDER BY component.name ASC
    `,
      { productId },
    );

    const alternatives = rows.map((row) => {
      const sortedSuppliers = [...row.suppliers].sort((left, right) => {
        const leftReliability = this.toNumber(left.company.reliability, 0.8);
        const rightReliability = this.toNumber(right.company.reliability, 0.8);

        const leftScore =
          this.toNumber(left.price, 0) * 0.5 +
          this.toNumber(left.leadTime, 14) * 1.5 -
          leftReliability * 20;

        const rightScore =
          this.toNumber(right.price, 0) * 0.5 +
          this.toNumber(right.leadTime, 14) * 1.5 -
          rightReliability * 20;

        return leftScore - rightScore;
      });

      return {
        componentId: row.componentId,
        componentName: row.componentName,
        suppliers: sortedSuppliers,
      };
    });

    return {
      productId,
      alternatives,
    };
  }

  async getImpactAnalysis(supplierId: string): Promise<JsonRecord> {
    if (!supplierId) {
      throw new BadRequestException('Supplier id is required');
    }

    const supplierRows = await this.neo4j.run<CompanyRecord>(
      `
      MATCH (c:Company {id: $supplierId})
      RETURN c{.*} AS company
      LIMIT 1
    `,
      { supplierId },
    );

    const supplier = supplierRows[0];
    if (!supplier) {
      throw new NotFoundException(`Supplier ${supplierId} not found`);
    }

    const impactRows = await this.neo4j.run<{
      productId: string;
      productName: string;
      affectedOrders: number;
      avgLeadTime: number;
      alternativeSupplyTime: number;
    }>(
      `
      MATCH (supplier:Company {id: $supplierId})<- [supply:SUPPLIED_BY]-(component:Component)<-[:COMPOSED_OF*1..8]-(product:Product)
      WITH DISTINCT supplier, supply, component, product
      OPTIONAL MATCH (order:Order)-[:CONTAINS]->(product)
      OPTIONAL MATCH (component)-[altSupply:SUPPLIED_BY]->(alternativeSupplier:Company)
      WHERE alternativeSupplier.id <> supplier.id
      WITH product,
           count(DISTINCT order) AS affectedOrders,
           avg(coalesce(supply.leadTime, 14)) AS avgLeadTime,
           min(coalesce(altSupply.leadTime, 28)) AS alternativeSupplyTime
      RETURN product.id AS productId,
             product.name AS productName,
             affectedOrders AS affectedOrders,
             round(coalesce(avgLeadTime, 14) * 100) / 100 AS avgLeadTime,
             round(coalesce(alternativeSupplyTime, coalesce(avgLeadTime, 14) + 8) * 100) / 100 AS alternativeSupplyTime
      ORDER BY affectedOrders DESC, product.name ASC
    `,
      { supplierId },
    );

    const affectedProducts = impactRows.map((row) => ({
      productId: row.productId,
      productName: row.productName,
      affectedOrders: this.toNumber(row.affectedOrders, 0),
      delayDays: Math.max(
        7,
        Math.round(this.toNumber(row.avgLeadTime, 14) * 1.8),
      ),
      alternativeSupplyTime: Math.round(
        this.toNumber(row.alternativeSupplyTime, 24),
      ),
    }));

    const totalAffectedOrders = affectedProducts.reduce(
      (sum, row) => sum + this.toNumber(row.affectedOrders, 0),
      0,
    );

    const estimatedCost = Math.round(totalAffectedOrders * 12000);
    const affectedRevenue = Math.round(totalAffectedOrders * 27000);

    const start = new Date();
    const end = new Date();
    end.setDate(start.getDate() + 30);

    return {
      supplierId,
      supplierName: supplier.name,
      scenarioName: 'Supplier outage for 30 days',
      impact: {
        affectedProducts,
        estimatedCost,
        affectedRevenue,
        timeline: `${start.toISOString().slice(0, 10)} to ${end
          .toISOString()
          .slice(0, 10)}`,
        mitigation: [
          'Switch volume to top-ranked alternative suppliers.',
          'Consume safety stock for short-cycle customer orders first.',
          'Prioritize high-margin orders during constrained window.',
        ],
      },
    };
  }

  async getInventoryStatus(locationId: string): Promise<JsonRecord> {
    const rows = await this.neo4j.run<JsonRecord>(
      `
      MATCH (location:Location {id: $locationId})
      OPTIONAL MATCH (product:Product)-[stored:STORED_AT]->(location)
      OPTIONAL MATCH (order:Order)-[contains:CONTAINS]->(product)
      WITH location,
           product,
           stored,
           avg(coalesce(contains.quantity, 0)) AS avgDemand
      WITH location,
           collect(
             CASE
               WHEN product IS NULL THEN NULL
               ELSE {
                 product: product{.*},
                 qty: coalesce(stored.quantity, 0),
                 lastRestockDate: stored.lastRestockDate,
                 daysOfSupply:
                   CASE
                     WHEN avgDemand IS NULL OR avgDemand = 0 THEN coalesce(stored.quantity, 0)
                     ELSE toInteger(coalesce(stored.quantity, 0) / avgDemand)
                   END
               }
             END
           ) AS rawProducts
      RETURN {
        location: location{.*},
        products: [entry IN rawProducts WHERE entry IS NOT NULL]
      } AS status
      LIMIT 1
    `,
      { locationId },
    );

    if (!rows[0]) {
      throw new NotFoundException(`Location ${locationId} not found`);
    }

    return rows[0];
  }

  async getCostBreakdown(orderId: string): Promise<JsonRecord> {
    const rows = await this.neo4j.run<{
      order: JsonRecord;
      materials: number;
      logistics: number;
      lines: JsonRecord[];
    }>(
      `
      MATCH (o:Order {id: $orderId})
      OPTIONAL MATCH (o)-[contains:CONTAINS]->(product:Product)
      OPTIONAL MATCH (product)-[bom:COMPOSED_OF]->(component:Component)
      OPTIONAL MATCH (component)-[supply:SUPPLIED_BY]->(:Company)
      OPTIONAL MATCH (o)-[:SHIPPED_VIA]->(route:Route)
      WITH o,
           route,
           collect(
             DISTINCT CASE
               WHEN product IS NULL THEN NULL
               ELSE {
                 productId: product.id,
                 productName: product.name,
                 quantity: contains.quantity,
                 unitPrice: contains.unitPrice
               }
             END
           ) AS rawLines,
           sum(coalesce(bom.quantity, 0) * coalesce(supply.price, component.price, 0)) AS materialCost
      RETURN o{.*} AS order,
             round(coalesce(materialCost, 0) * 100) / 100 AS materials,
             round(coalesce(route.cost, 0) * 100) / 100 AS logistics,
             [line IN rawLines WHERE line IS NOT NULL] AS lines
      LIMIT 1
    `,
      { orderId },
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const total = this.toNumber(row.order.cost, 0);
    const materials = this.toNumber(row.materials, 0);
    const logistics = this.toNumber(row.logistics, 0);
    const manufacturing = Math.max(0, total - materials - logistics);

    return {
      orderId,
      totalCost: Number(total.toFixed(2)),
      breakdown: {
        materials: Number(materials.toFixed(2)),
        manufacturing: Number(manufacturing.toFixed(2)),
        logistics: Number(logistics.toFixed(2)),
      },
      lines: row.lines,
    };
  }

  async forecastDelays(months: number): Promise<JsonRecord> {
    const horizon = Math.max(1, Math.min(months, 24));

    const historyRows = await this.neo4j.run<{
      total: number;
      delayed: number;
      avgReliability: number;
    }>(`
      MATCH (o:Order)
      OPTIONAL MATCH (o)-[:PLACED_WITH]->(supplier:Company)
      RETURN count(o) AS total,
             sum(CASE WHEN o.status = 'delayed' THEN 1 ELSE 0 END) AS delayed,
             avg(coalesce(supplier.reliability, 0.88)) AS avgReliability
    `);

    const history = historyRows[0] ?? {
      total: 0,
      delayed: 0,
      avgReliability: 0.88,
    };

    const baseDelayRate =
      this.toNumber(history.total, 0) === 0
        ? 0.12
        : this.toNumber(history.delayed, 0) / this.toNumber(history.total, 1);

    const reliabilityPenalty =
      (1 - this.toNumber(history.avgReliability, 0.88)) * 0.12;
    const monthlyVolume = Math.max(
      8,
      Math.round(this.toNumber(history.total, 0) / 6) || 8,
    );

    const now = new Date();
    const projection = Array.from({ length: horizon }, (_, index) => {
      const monthDate = new Date(now);
      monthDate.setMonth(now.getMonth() + index + 1);

      const trend = index * 0.01;
      const projectedDelayRate = Math.max(
        0.04,
        Math.min(0.95, baseDelayRate + reliabilityPenalty + trend),
      );

      return {
        month: monthDate.toISOString().slice(0, 7),
        projectedDelayRate: Number(projectedDelayRate.toFixed(3)),
        estimatedDelayedOrders: Math.round(projectedDelayRate * monthlyVolume),
      };
    });

    return {
      months: horizon,
      basedOn: {
        totalOrders: this.toNumber(history.total, 0),
        delayedOrders: this.toNumber(history.delayed, 0),
        averageSupplierReliability: Number(
          this.toNumber(history.avgReliability, 0.88).toFixed(3),
        ),
      },
      projection,
    };
  }

  async forecastStockLevels(
    productId: string,
    horizonParam: string,
  ): Promise<JsonRecord> {
    if (!productId) {
      throw new BadRequestException('Product id is required');
    }

    const parsedHorizon = this.parseHorizonMonths(horizonParam);

    const rows = await this.neo4j.run<{
      product: JsonRecord;
      currentStock: number;
      avgOrderQty: number;
      totalOrderLines: number;
    }>(
      `
      MATCH (p:Product {id: $productId})
      OPTIONAL MATCH (p)-[stored:STORED_AT]->(:Location)
      WITH p, sum(coalesce(stored.quantity, 0)) AS currentStock
      OPTIONAL MATCH (:Order)-[contains:CONTAINS]->(p)
      RETURN p{.*} AS product,
             currentStock,
             avg(coalesce(contains.quantity, 0)) AS avgOrderQty,
             count(contains) AS totalOrderLines
      LIMIT 1
    `,
      { productId },
    );

    const record = rows[0];
    if (!record) {
      throw new NotFoundException(`Product ${productId} not found`);
    }

    const avgOrderQty = this.toNumber(record.avgOrderQty, 0);
    const totalOrderLines = this.toNumber(record.totalOrderLines, 0);
    const inferredMonthlyDemand = Math.max(
      5,
      Math.round(avgOrderQty * Math.max(1, totalOrderLines / 4)),
    );

    let runningStock = Math.max(
      0,
      Math.round(this.toNumber(record.currentStock, 0)),
    );
    const now = new Date();

    const projection = Array.from({ length: parsedHorizon }, (_, index) => {
      const date = new Date(now);
      date.setMonth(now.getMonth() + index + 1);

      const replenishment =
        (index + 1) % 3 === 0 ? Math.round(inferredMonthlyDemand * 1.4) : 0;
      runningStock = Math.max(
        0,
        runningStock - inferredMonthlyDemand + replenishment,
      );

      return {
        month: date.toISOString().slice(0, 7),
        projectedStock: runningStock,
        monthlyDemand: inferredMonthlyDemand,
        replenishment,
      };
    });

    return {
      product: record.product,
      horizonMonths: parsedHorizon,
      currentStock: this.toNumber(record.currentStock, 0),
      projection,
      reorderPoint: inferredMonthlyDemand * 2,
    };
  }

  async seedData(force = false): Promise<JsonRecord> {
    const beforeNodes = await this.countNodes();

    if (force) {
      await this.deleteAllData();
    }

    await this.seedIfEmpty();
    const afterNodes = await this.countNodes();

    return {
      action: 'seed',
      force,
      beforeNodes,
      afterNodes,
      createdNodes: Math.max(0, afterNodes - (force ? 0 : beforeNodes)),
      seeded: force || beforeNodes === 0,
    };
  }

  async deleteAllData(): Promise<JsonRecord> {
    const beforeNodes = await this.countNodes();

    await this.neo4j.run(`
      MATCH (n)
      DETACH DELETE n
    `);

    const afterNodes = await this.countNodes();

    return {
      action: 'delete_all_data',
      beforeNodes,
      afterNodes,
      deletedNodes: Math.max(0, beforeNodes - afterNodes),
      deleted: true,
    };
  }

  async seedIfEmpty(): Promise<void> {
    const rows = await this.neo4j.run<Neo4jCountResponse>(
      `
      MATCH (p:Product)
      RETURN count(p) AS count
    `,
    );

    if (this.toNumber(rows[0]?.count, 0) > 0) {
      return;
    }

    await this.neo4j.run(`
      MERGE (loc1:Location {id: 'loc-prg-01'})
      SET loc1.name = 'Prague Manufacturing Hub',
          loc1.type = 'warehouse',
          loc1.coordinates = '50.0755,14.4378',
          loc1.capacity = 24000

      MERGE (loc2:Location {id: 'loc-ham-01'})
      SET loc2.name = 'Hamburg Port Hub',
          loc2.type = 'port',
          loc2.coordinates = '53.5511,9.9937',
          loc2.capacity = 55000

      MERGE (loc3:Location {id: 'loc-rtm-01'})
      SET loc3.name = 'Rotterdam Distribution Node',
          loc3.type = 'distribution_center',
          loc3.coordinates = '51.9244,4.4777',
          loc3.capacity = 46000

      MERGE (loc4:Location {id: 'loc-nyc-01'})
      SET loc4.name = 'New York Retail Buffer',
          loc4.type = 'distribution_center',
          loc4.coordinates = '40.7128,-74.0060',
          loc4.capacity = 33000

      MERGE (loc5:Location {id: 'loc-sin-01'})
      SET loc5.name = 'Singapore Freeport Hub',
          loc5.type = 'port',
          loc5.coordinates = '1.2903,103.8519',
          loc5.capacity = 62000

      MERGE (loc6:Location {id: 'loc-dxb-01'})
      SET loc6.name = 'Dubai Air Cargo Gateway',
          loc6.type = 'airport',
          loc6.coordinates = '25.2048,55.2708',
          loc6.capacity = 47000

      MERGE (loc7:Location {id: 'loc-chi-01'})
      SET loc7.name = 'Chicago Inland Terminal',
          loc7.type = 'distribution_center',
          loc7.coordinates = '41.8781,-87.6298',
          loc7.capacity = 38000

      MERGE (loc8:Location {id: 'loc-lax-01'})
      SET loc8.name = 'Los Angeles Pacific Port',
          loc8.type = 'port',
          loc8.coordinates = '34.0522,-118.2437',
          loc8.capacity = 51000

      MERGE (loc9:Location {id: 'loc-aus-01'})
      SET loc9.name = 'Austin Integration Node',
          loc9.type = 'warehouse',
          loc9.coordinates = '30.2672,-97.7431',
          loc9.capacity = 29000

      WITH loc1, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9
      UNWIND [
        {id: 'route-01', name: 'Central Europe Artery', distance: 1350, estimatedTime: 4, cost: 1580, reliability: 0.93},
        {id: 'route-02', name: 'Transatlantic Mainline', distance: 5870, estimatedTime: 8, cost: 6500, reliability: 0.84},
        {id: 'route-03', name: 'US Inland Relay', distance: 2320, estimatedTime: 4, cost: 2680, reliability: 0.9},
        {id: 'route-04', name: 'Pacific Entry', distance: 14120, estimatedTime: 13, cost: 9800, reliability: 0.82},
        {id: 'route-05', name: 'West-Central Transfer', distance: 2800, estimatedTime: 5, cost: 3200, reliability: 0.88},
        {id: 'route-06', name: 'Gulf Air Bridge', distance: 4450, estimatedTime: 4, cost: 5400, reliability: 0.86},
        {id: 'route-07', name: 'Atlantic Return', distance: 6600, estimatedTime: 10, cost: 6900, reliability: 0.83},
        {id: 'route-08', name: 'EU Fast Lane', distance: 910, estimatedTime: 2, cost: 1200, reliability: 0.94},
        {id: 'route-09', name: 'Northbound Express', distance: 1280, estimatedTime: 3, cost: 1500, reliability: 0.91},
        {id: 'route-10', name: 'US Crosslink', distance: 3300, estimatedTime: 6, cost: 3900, reliability: 0.87},
        {id: 'route-11', name: 'Silk Corridor', distance: 5810, estimatedTime: 6, cost: 6100, reliability: 0.85}
      ] AS routeSpec
      MERGE (route:Route {id: routeSpec.id})
      SET route.name = routeSpec.name,
          route.distance = routeSpec.distance,
          route.estimatedTime = routeSpec.estimatedTime,
          route.cost = routeSpec.cost,
          route.reliability = routeSpec.reliability

      WITH DISTINCT 1 AS _
      UNWIND [
        {routeId: 'route-01', leg: 1, fromId: 'loc-prg-01', toId: 'loc-ham-01', distance: 620, time: 2, cost: 760, reliability: 0.965},
        {routeId: 'route-01', leg: 2, fromId: 'loc-ham-01', toId: 'loc-rtm-01', distance: 730, time: 2, cost: 820, reliability: 0.964},
        {routeId: 'route-02', leg: 1, fromId: 'loc-rtm-01', toId: 'loc-nyc-01', distance: 5870, time: 8, cost: 6500, reliability: 0.84},
        {routeId: 'route-03', leg: 1, fromId: 'loc-nyc-01', toId: 'loc-chi-01', distance: 1270, time: 2, cost: 1450, reliability: 0.949},
        {routeId: 'route-03', leg: 2, fromId: 'loc-chi-01', toId: 'loc-aus-01', distance: 1050, time: 2, cost: 1230, reliability: 0.948},
        {routeId: 'route-04', leg: 1, fromId: 'loc-sin-01', toId: 'loc-lax-01', distance: 14120, time: 13, cost: 9800, reliability: 0.82},
        {routeId: 'route-05', leg: 1, fromId: 'loc-lax-01', toId: 'loc-chi-01', distance: 2800, time: 5, cost: 3200, reliability: 0.88},
        {routeId: 'route-06', leg: 1, fromId: 'loc-dxb-01', toId: 'loc-prg-01', distance: 4450, time: 4, cost: 5400, reliability: 0.86},
        {routeId: 'route-07', leg: 1, fromId: 'loc-nyc-01', toId: 'loc-rtm-01', distance: 5870, time: 8, cost: 6100, reliability: 0.87},
        {routeId: 'route-07', leg: 2, fromId: 'loc-rtm-01', toId: 'loc-ham-01', distance: 730, time: 2, cost: 800, reliability: 0.954},
        {routeId: 'route-08', leg: 1, fromId: 'loc-prg-01', toId: 'loc-rtm-01', distance: 910, time: 2, cost: 1200, reliability: 0.94},
        {routeId: 'route-09', leg: 1, fromId: 'loc-chi-01', toId: 'loc-nyc-01', distance: 1280, time: 3, cost: 1500, reliability: 0.91},
        {routeId: 'route-10', leg: 1, fromId: 'loc-lax-01', toId: 'loc-aus-01', distance: 3300, time: 6, cost: 3900, reliability: 0.87},
        {routeId: 'route-11', leg: 1, fromId: 'loc-sin-01', toId: 'loc-dxb-01', distance: 3390, time: 3, cost: 3000, reliability: 0.922},
        {routeId: 'route-11', leg: 2, fromId: 'loc-dxb-01', toId: 'loc-prg-01', distance: 2420, time: 3, cost: 3100, reliability: 0.922}
      ] AS segmentSpec
      MATCH (from:Location {id: segmentSpec.fromId})
      MATCH (to:Location {id: segmentSpec.toId})
      MERGE (from)-[segment:CONNECTED_TO {routeId: segmentSpec.routeId, leg: segmentSpec.leg}]->(to)
      SET segment.distance = segmentSpec.distance,
          segment.time = segmentSpec.time,
          segment.cost = segmentSpec.cost,
          segment.reliability = segmentSpec.reliability

      WITH DISTINCT 1 AS _
      MERGE (sup1:Company {id: 'c-sup-01'})
      SET sup1.name = 'Aqua Chips Supply',
          sup1.type = 'supplier',
          sup1.country = 'Czech Republic',
          sup1.coordinates = '50.0730,14.4180',
          sup1.reliability = 0.91

      MERGE (sup2:Company {id: 'c-sup-02'})
      SET sup2.name = 'Polar Silicon Ltd',
          sup2.type = 'supplier',
          sup2.country = 'Germany',
          sup2.coordinates = '53.8655,10.6866',
          sup2.reliability = 0.95

      MERGE (sup3:Company {id: 'c-sup-03'})
      SET sup3.name = 'Harbor Metals & Fasteners',
          sup3.type = 'supplier',
          sup3.country = 'Netherlands',
          sup3.coordinates = '51.9518,4.1550',
          sup3.reliability = 0.89

      MERGE (sup4:Company {id: 'c-sup-04'})
      SET sup4.name = 'Nimbus Power Systems',
          sup4.type = 'supplier',
          sup4.country = 'United Arab Emirates',
          sup4.coordinates = '25.2048,55.2708',
          sup4.reliability = 0.9

      MERGE (sup5:Company {id: 'c-sup-05'})
      SET sup5.name = 'Crystal Memory Foundry',
          sup5.type = 'supplier',
          sup5.country = 'United States',
          sup5.coordinates = '34.0522,-118.2437',
          sup5.reliability = 0.92

      MERGE (man1:Company {id: 'c-man-01'})
      SET man1.name = 'Blue Shark Assembly',
          man1.type = 'manufacturer',
          man1.country = 'Czech Republic',
          man1.coordinates = '50.0850,14.4200',
          man1.reliability = 0.94

      MERGE (dist1:Company {id: 'c-dist-01'})
      SET dist1.name = 'North Sea Distribution',
          dist1.type = 'distributor',
          dist1.country = 'Netherlands',
          dist1.coordinates = '51.9200,4.4800',
          dist1.reliability = 0.9

      MERGE (dist2:Company {id: 'c-dist-02'})
      SET dist2.name = 'Great Lakes Fulfillment',
          dist2.type = 'distributor',
          dist2.country = 'United States',
          dist2.coordinates = '41.8781,-87.6298',
          dist2.reliability = 0.91

      MERGE (dist3:Company {id: 'c-dist-03'})
      SET dist3.name = 'Pacific Edge Distribution',
          dist3.type = 'distributor',
          dist3.country = 'United States',
          dist3.coordinates = '34.0522,-118.2437',
          dist3.reliability = 0.88

      MERGE (ret1:Company {id: 'c-ret-01'})
      SET ret1.name = 'Wave Retail Europe',
          ret1.type = 'retailer',
          ret1.country = 'France',
          ret1.coordinates = '48.8566,2.3522',
          ret1.reliability = 0.89

      MERGE (cust1:Company {id: 'c-cust-01'})
      SET cust1.name = 'ByteCraft Stores',
          cust1.type = 'customer',
          cust1.country = 'United States',
          cust1.coordinates = '40.7128,-74.0060',
          cust1.reliability = 0.93

      MERGE (cust2:Company {id: 'c-cust-02'})
      SET cust2.name = 'Atlas Cloud Services',
          cust2.type = 'customer',
          cust2.country = 'United States',
          cust2.coordinates = '30.2672,-97.7431',
          cust2.reliability = 0.94

      WITH DISTINCT 1 AS _
      UNWIND [
        {supplierId: 'c-sup-01', manufacturerId: 'c-man-01', contractSince: '2022-01-15', minOrder: 200, leadTime: 11},
        {supplierId: 'c-sup-02', manufacturerId: 'c-man-01', contractSince: '2023-04-01', minOrder: 150, leadTime: 9},
        {supplierId: 'c-sup-03', manufacturerId: 'c-man-01', contractSince: '2023-08-12', minOrder: 600, leadTime: 6},
        {supplierId: 'c-sup-04', manufacturerId: 'c-man-01', contractSince: '2024-01-20', minOrder: 220, leadTime: 12},
        {supplierId: 'c-sup-05', manufacturerId: 'c-man-01', contractSince: '2023-11-07', minOrder: 320, leadTime: 10}
      ] AS supplySpec
      MATCH (supplier:Company {id: supplySpec.supplierId})
      MATCH (manufacturer:Company {id: supplySpec.manufacturerId})
      MERGE (supplier)-[supplies:SUPPLIES]->(manufacturer)
      SET supplies.contractSince = supplySpec.contractSince,
          supplies.minOrder = supplySpec.minOrder,
          supplies.leadTime = supplySpec.leadTime

      WITH DISTINCT 1 AS _
      UNWIND [
        {companyId: 'c-sup-01', locationId: 'loc-prg-01', since: '2022-01-15'},
        {companyId: 'c-sup-02', locationId: 'loc-ham-01', since: '2022-06-21'},
        {companyId: 'c-sup-03', locationId: 'loc-rtm-01', since: '2023-08-12'},
        {companyId: 'c-sup-04', locationId: 'loc-dxb-01', since: '2024-01-20'},
        {companyId: 'c-sup-05', locationId: 'loc-lax-01', since: '2023-11-07'},
        {companyId: 'c-man-01', locationId: 'loc-prg-01', since: '2021-03-10'},
        {companyId: 'c-dist-01', locationId: 'loc-rtm-01', since: '2021-06-11'},
        {companyId: 'c-dist-02', locationId: 'loc-chi-01', since: '2022-04-09'},
        {companyId: 'c-dist-03', locationId: 'loc-lax-01', since: '2022-09-14'},
        {companyId: 'c-ret-01', locationId: 'loc-ham-01', since: '2021-02-21'},
        {companyId: 'c-cust-01', locationId: 'loc-nyc-01', since: '2020-10-12'},
        {companyId: 'c-cust-02', locationId: 'loc-aus-01', since: '2021-11-19'}
      ] AS companyLocation
      MATCH (company:Company {id: companyLocation.companyId})
      MATCH (location:Location {id: companyLocation.locationId})
      MERGE (company)-[locRel:LOCATED_AT]->(location)
      SET locRel.since = companyLocation.since

      WITH DISTINCT 1 AS _

      MERGE (p1:Product {id: 'prod-01'})
      SET p1.name = 'Shark Laptop CPU',
          p1.sku = 'BS-CPU-001',
          p1.price = 430,
          p1.weight = 0.2,
          p1.leadTime = 14,
          p1.status = 'active'

      MERGE (p2:Product {id: 'prod-02'})
      SET p2.name = 'Ocean RAM Module',
          p2.sku = 'BS-RAM-004',
          p2.price = 195,
          p2.weight = 0.08,
          p2.leadTime = 10,
          p2.status = 'active'

      MERGE (p3:Product {id: 'prod-03'})
      SET p3.name = 'Reef Edge Server',
          p3.sku = 'BS-SRV-009',
          p3.price = 5200,
          p3.weight = 18.6,
          p3.leadTime = 35,
          p3.status = 'active'

      MERGE (p4:Product {id: 'prod-04'})
      SET p4.name = 'Reef Edge Maintenance Kit',
          p4.sku = 'BS-MNT-002',
          p4.price = 240,
          p4.weight = 1.8,
          p4.leadTime = 9,
          p4.status = 'active'

      MERGE (comp1:Component {id: 'comp-01'})
      SET comp1.name = '7nm Silicon Wafer',
          comp1.price = 75,
          comp1.quantity = 2,
          comp1.criticality = 'high'

      MERGE (comp2:Component {id: 'comp-02'})
      SET comp2.name = 'Micro Cooling Plate',
          comp2.price = 18,
          comp2.quantity = 1,
          comp2.criticality = 'medium'

      MERGE (comp3:Component {id: 'comp-03'})
      SET comp3.name = 'PCB Substrate',
          comp3.price = 22,
          comp3.quantity = 1,
          comp3.criticality = 'high'

      MERGE (comp4:Component {id: 'comp-04'})
      SET comp4.name = 'DDR Control Chip',
          comp4.price = 48,
          comp4.quantity = 4,
          comp4.criticality = 'high'

      WITH DISTINCT 1 AS _
      UNWIND [
        {id: 'comp-srv-001', name: '2U Steel Chassis', price: 340, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-002', name: 'Dual-Socket Motherboard', price: 920, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-003', name: 'Compute CPU Package', price: 680, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-004', name: '32GB ECC RAM Module', price: 165, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-005', name: '1200W Redundant PSU', price: 245, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-006', name: '4TB Enterprise NVMe Drive', price: 420, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-007', name: '120mm High Static Pressure Fan', price: 26, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-008', name: 'Thermal Interface Kit', price: 18, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-009', name: 'Rack Rail Kit', price: 49, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-010', name: 'Assembly Fastener Kit', price: 22, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-011', name: 'Front IO Panel', price: 32, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-020', name: 'VRM Power Stage Set', price: 96, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-021', name: 'Platform Controller Hub', price: 81, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-022', name: 'BMC Management Controller', price: 73, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-023', name: '10GbE Controller', price: 64, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-024', name: 'PCIe x16 Slot Assembly', price: 19, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-025', name: 'SATA Backplane Controller', price: 27, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-026', name: 'Rear IO Shield', price: 11, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-027', name: 'Clock Generator IC', price: 9, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-028', name: 'Firmware EEPROM', price: 5, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-030', name: 'Integrated Heat Spreader', price: 22, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-031', name: 'CPU Organic Substrate', price: 14, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-032', name: 'Lead-Free Solder Bump Array', price: 6, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-040', name: 'DIMM PCB Blank', price: 13, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-041', name: '16Gb DRAM Die Package', price: 18, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-042', name: 'DIMM PMIC', price: 7, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-043', name: 'SPD EEPROM', price: 2, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-044', name: 'Thermal Pad Strip', price: 1, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-045', name: 'Memory Silicon Wafer Slice', price: 8, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-046', name: 'Gold Bond Wire Set', price: 2, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-047', name: 'Epoxy Molding Resin', price: 1, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-048', name: 'BGA Solder Ball Matrix', price: 1, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-050', name: 'High Frequency Transformer Core', price: 26, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-051', name: 'Primary MOSFET Set', price: 34, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-052', name: 'Secondary Rectifier Set', price: 19, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-053', name: 'High Voltage Capacitor Bank', price: 23, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-054', name: 'PFC Inductor Choke Set', price: 17, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-055', name: 'PSU Control Board', price: 31, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-056', name: '80mm PSU Cooling Fan', price: 14, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-057', name: 'PSU Wiring Harness', price: 12, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-058', name: 'Output Connector Set', price: 9, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-059', name: 'PWM Controller IC', price: 5, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-060', name: 'Optocoupler Set', price: 4, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-061', name: 'Current Sense Resistor Array', price: 3, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-070', name: 'Fan Frame', price: 4, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-071', name: 'Fan Blade Assembly', price: 3, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-072', name: 'Brushless Fan Motor', price: 8, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-073', name: 'Fan Bearing Set', price: 2, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-074', name: 'Fan Wire Lead', price: 1, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-080', name: 'M3 Screw Pack', price: 5, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-081', name: 'Brass Standoff Pack', price: 6, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-082', name: 'Spring Washer Pack', price: 2, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-083', name: 'Cable Tie Pack', price: 2, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-084', name: 'EMI Gasket Strip', price: 3, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-090', name: 'Thermal Paste Syringe', price: 7, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-091', name: 'Thermal Pad Sheet', price: 3, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-092', name: 'Isopropyl Cleaning Wipe Kit', price: 2, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-100', name: 'Steel Frame', price: 95, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-101', name: 'Drive Backplane', price: 72, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-102', name: 'Hot Swap Drive Cage', price: 48, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-103', name: 'Airflow Shroud', price: 16, quantity: 1, criticality: 'medium'},
        {id: 'comp-srv-104', name: 'Front Bezel', price: 21, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-105', name: 'Power Distribution Board', price: 46, quantity: 1, criticality: 'high'},
        {id: 'comp-srv-110', name: 'USB Service Port', price: 6, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-111', name: 'Status LED Set', price: 2, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-112', name: 'IO Ribbon Cable', price: 2, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-120', name: 'Left Rail Assembly', price: 14, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-121', name: 'Right Rail Assembly', price: 14, quantity: 1, criticality: 'low'},
        {id: 'comp-srv-122', name: 'Rail Latch Pair', price: 4, quantity: 1, criticality: 'low'}
      ] AS componentSpec
      MERGE (component:Component {id: componentSpec.id})
      SET component.name = componentSpec.name,
          component.price = componentSpec.price,
          component.quantity = componentSpec.quantity,
          component.criticality = componentSpec.criticality

      WITH DISTINCT 1 AS _
      UNWIND [
        {productId: 'prod-01', componentId: 'comp-01', quantity: 2, position: 1},
        {productId: 'prod-01', componentId: 'comp-02', quantity: 1, position: 2},
        {productId: 'prod-02', componentId: 'comp-03', quantity: 1, position: 1},
        {productId: 'prod-02', componentId: 'comp-04', quantity: 4, position: 2},
        {productId: 'prod-03', componentId: 'comp-srv-001', quantity: 1, position: 1},
        {productId: 'prod-03', componentId: 'comp-srv-002', quantity: 1, position: 2},
        {productId: 'prod-03', componentId: 'comp-srv-003', quantity: 2, position: 3},
        {productId: 'prod-03', componentId: 'comp-srv-004', quantity: 16, position: 4},
        {productId: 'prod-03', componentId: 'comp-srv-005', quantity: 2, position: 5},
        {productId: 'prod-03', componentId: 'comp-srv-006', quantity: 8, position: 6},
        {productId: 'prod-03', componentId: 'comp-srv-007', quantity: 6, position: 7},
        {productId: 'prod-03', componentId: 'comp-srv-008', quantity: 2, position: 8},
        {productId: 'prod-03', componentId: 'comp-srv-009', quantity: 1, position: 9},
        {productId: 'prod-03', componentId: 'comp-srv-010', quantity: 1, position: 10},
        {productId: 'prod-03', componentId: 'comp-srv-011', quantity: 1, position: 11},
        {productId: 'prod-04', componentId: 'comp-srv-008', quantity: 1, position: 1},
        {productId: 'prod-04', componentId: 'comp-srv-010', quantity: 1, position: 2},
        {productId: 'prod-04', componentId: 'comp-srv-090', quantity: 2, position: 3},
        {productId: 'prod-04', componentId: 'comp-srv-110', quantity: 1, position: 4}
      ] AS productBom
      MATCH (product:Product {id: productBom.productId})
      MATCH (component:Component {id: productBom.componentId})
      MERGE (product)-[bom:COMPOSED_OF]->(component)
      SET bom.quantity = productBom.quantity,
          bom.position = productBom.position

      WITH DISTINCT 1 AS _
      UNWIND [
        {parentComponentId: 'comp-srv-002', componentId: 'comp-03', quantity: 1, position: 1},
        {parentComponentId: 'comp-srv-002', componentId: 'comp-srv-020', quantity: 2, position: 2},
        {parentComponentId: 'comp-srv-002', componentId: 'comp-srv-021', quantity: 1, position: 3},
        {parentComponentId: 'comp-srv-002', componentId: 'comp-srv-022', quantity: 1, position: 4},
        {parentComponentId: 'comp-srv-002', componentId: 'comp-srv-023', quantity: 2, position: 5},
        {parentComponentId: 'comp-srv-002', componentId: 'comp-srv-024', quantity: 6, position: 6},
        {parentComponentId: 'comp-srv-002', componentId: 'comp-srv-025', quantity: 1, position: 7},
        {parentComponentId: 'comp-srv-002', componentId: 'comp-srv-026', quantity: 1, position: 8},
        {parentComponentId: 'comp-srv-002', componentId: 'comp-srv-027', quantity: 1, position: 9},
        {parentComponentId: 'comp-srv-002', componentId: 'comp-srv-028', quantity: 2, position: 10},
        {parentComponentId: 'comp-srv-003', componentId: 'comp-01', quantity: 1, position: 1},
        {parentComponentId: 'comp-srv-003', componentId: 'comp-srv-030', quantity: 1, position: 2},
        {parentComponentId: 'comp-srv-003', componentId: 'comp-srv-031', quantity: 1, position: 3},
        {parentComponentId: 'comp-srv-003', componentId: 'comp-srv-032', quantity: 1900, position: 4},
        {parentComponentId: 'comp-srv-004', componentId: 'comp-srv-040', quantity: 1, position: 1},
        {parentComponentId: 'comp-srv-004', componentId: 'comp-srv-041', quantity: 8, position: 2},
        {parentComponentId: 'comp-srv-004', componentId: 'comp-srv-042', quantity: 1, position: 3},
        {parentComponentId: 'comp-srv-004', componentId: 'comp-srv-043', quantity: 1, position: 4},
        {parentComponentId: 'comp-srv-004', componentId: 'comp-srv-044', quantity: 2, position: 5},
        {parentComponentId: 'comp-srv-041', componentId: 'comp-srv-045', quantity: 1, position: 1},
        {parentComponentId: 'comp-srv-041', componentId: 'comp-srv-046', quantity: 32, position: 2},
        {parentComponentId: 'comp-srv-041', componentId: 'comp-srv-047', quantity: 1, position: 3},
        {parentComponentId: 'comp-srv-041', componentId: 'comp-srv-048', quantity: 140, position: 4},
        {parentComponentId: 'comp-srv-005', componentId: 'comp-srv-050', quantity: 1, position: 1},
        {parentComponentId: 'comp-srv-005', componentId: 'comp-srv-051', quantity: 4, position: 2},
        {parentComponentId: 'comp-srv-005', componentId: 'comp-srv-052', quantity: 2, position: 3},
        {parentComponentId: 'comp-srv-005', componentId: 'comp-srv-053', quantity: 6, position: 4},
        {parentComponentId: 'comp-srv-005', componentId: 'comp-srv-054', quantity: 3, position: 5},
        {parentComponentId: 'comp-srv-005', componentId: 'comp-srv-055', quantity: 1, position: 6},
        {parentComponentId: 'comp-srv-005', componentId: 'comp-srv-056', quantity: 1, position: 7},
        {parentComponentId: 'comp-srv-005', componentId: 'comp-srv-057', quantity: 1, position: 8},
        {parentComponentId: 'comp-srv-005', componentId: 'comp-srv-058', quantity: 6, position: 9},
        {parentComponentId: 'comp-srv-055', componentId: 'comp-03', quantity: 1, position: 1},
        {parentComponentId: 'comp-srv-055', componentId: 'comp-srv-059', quantity: 1, position: 2},
        {parentComponentId: 'comp-srv-055', componentId: 'comp-srv-060', quantity: 2, position: 3},
        {parentComponentId: 'comp-srv-055', componentId: 'comp-srv-061', quantity: 4, position: 4},
        {parentComponentId: 'comp-srv-007', componentId: 'comp-srv-070', quantity: 1, position: 1},
        {parentComponentId: 'comp-srv-007', componentId: 'comp-srv-071', quantity: 1, position: 2},
        {parentComponentId: 'comp-srv-007', componentId: 'comp-srv-072', quantity: 1, position: 3},
        {parentComponentId: 'comp-srv-007', componentId: 'comp-srv-073', quantity: 1, position: 4},
        {parentComponentId: 'comp-srv-007', componentId: 'comp-srv-074', quantity: 1, position: 5},
        {parentComponentId: 'comp-srv-010', componentId: 'comp-srv-080', quantity: 96, position: 1},
        {parentComponentId: 'comp-srv-010', componentId: 'comp-srv-081', quantity: 28, position: 2},
        {parentComponentId: 'comp-srv-010', componentId: 'comp-srv-082', quantity: 96, position: 3},
        {parentComponentId: 'comp-srv-010', componentId: 'comp-srv-083', quantity: 24, position: 4},
        {parentComponentId: 'comp-srv-010', componentId: 'comp-srv-084', quantity: 6, position: 5},
        {parentComponentId: 'comp-srv-008', componentId: 'comp-srv-090', quantity: 2, position: 1},
        {parentComponentId: 'comp-srv-008', componentId: 'comp-srv-091', quantity: 4, position: 2},
        {parentComponentId: 'comp-srv-008', componentId: 'comp-srv-092', quantity: 8, position: 3},
        {parentComponentId: 'comp-srv-001', componentId: 'comp-srv-100', quantity: 1, position: 1},
        {parentComponentId: 'comp-srv-001', componentId: 'comp-srv-101', quantity: 2, position: 2},
        {parentComponentId: 'comp-srv-001', componentId: 'comp-srv-102', quantity: 2, position: 3},
        {parentComponentId: 'comp-srv-001', componentId: 'comp-srv-103', quantity: 2, position: 4},
        {parentComponentId: 'comp-srv-001', componentId: 'comp-srv-104', quantity: 1, position: 5},
        {parentComponentId: 'comp-srv-001', componentId: 'comp-srv-105', quantity: 1, position: 6},
        {parentComponentId: 'comp-srv-011', componentId: 'comp-srv-110', quantity: 2, position: 1},
        {parentComponentId: 'comp-srv-011', componentId: 'comp-srv-111', quantity: 6, position: 2},
        {parentComponentId: 'comp-srv-011', componentId: 'comp-srv-112', quantity: 2, position: 3},
        {parentComponentId: 'comp-srv-009', componentId: 'comp-srv-120', quantity: 1, position: 1},
        {parentComponentId: 'comp-srv-009', componentId: 'comp-srv-121', quantity: 1, position: 2},
        {parentComponentId: 'comp-srv-009', componentId: 'comp-srv-122', quantity: 2, position: 3}
      ] AS nestedBom
      MATCH (parentComponent:Component {id: nestedBom.parentComponentId})
      MATCH (component:Component {id: nestedBom.componentId})
      MERGE (parentComponent)-[bom:COMPOSED_OF]->(component)
      SET bom.quantity = nestedBom.quantity,
          bom.position = nestedBom.position

      WITH DISTINCT 1 AS _
      UNWIND [
        {componentId: 'comp-01', supplierId: 'c-sup-01', price: 74, leadTime: 11, minOrder: 200},
        {componentId: 'comp-01', supplierId: 'c-sup-02', price: 79, leadTime: 9, minOrder: 150},
        {componentId: 'comp-02', supplierId: 'c-sup-01', price: 18, leadTime: 7, minOrder: 80},
        {componentId: 'comp-03', supplierId: 'c-sup-02', price: 23, leadTime: 8, minOrder: 100},
        {componentId: 'comp-03', supplierId: 'c-sup-05', price: 24, leadTime: 10, minOrder: 90},
        {componentId: 'comp-04', supplierId: 'c-sup-02', price: 47, leadTime: 9, minOrder: 120},
        {componentId: 'comp-04', supplierId: 'c-sup-05', price: 49, leadTime: 11, minOrder: 100},
        {componentId: 'comp-srv-001', supplierId: 'c-sup-03', price: 336, leadTime: 6, minOrder: 30},
        {componentId: 'comp-srv-002', supplierId: 'c-sup-02', price: 905, leadTime: 12, minOrder: 20},
        {componentId: 'comp-srv-003', supplierId: 'c-sup-02', price: 672, leadTime: 10, minOrder: 40},
        {componentId: 'comp-srv-004', supplierId: 'c-sup-05', price: 161, leadTime: 8, minOrder: 120},
        {componentId: 'comp-srv-005', supplierId: 'c-sup-04', price: 241, leadTime: 13, minOrder: 40},
        {componentId: 'comp-srv-006', supplierId: 'c-sup-02', price: 415, leadTime: 11, minOrder: 25},
        {componentId: 'comp-srv-007', supplierId: 'c-sup-03', price: 24, leadTime: 5, minOrder: 120},
        {componentId: 'comp-srv-008', supplierId: 'c-sup-01', price: 17, leadTime: 4, minOrder: 200},
        {componentId: 'comp-srv-009', supplierId: 'c-sup-03', price: 48, leadTime: 5, minOrder: 100},
        {componentId: 'comp-srv-010', supplierId: 'c-sup-03', price: 21, leadTime: 4, minOrder: 200},
        {componentId: 'comp-srv-011', supplierId: 'c-sup-03', price: 31, leadTime: 6, minOrder: 70},
        {componentId: 'comp-srv-020', supplierId: 'c-sup-02', price: 95, leadTime: 9, minOrder: 50},
        {componentId: 'comp-srv-021', supplierId: 'c-sup-02', price: 80, leadTime: 10, minOrder: 45},
        {componentId: 'comp-srv-022', supplierId: 'c-sup-05', price: 72, leadTime: 9, minOrder: 40},
        {componentId: 'comp-srv-023', supplierId: 'c-sup-05', price: 64, leadTime: 8, minOrder: 60},
        {componentId: 'comp-srv-024', supplierId: 'c-sup-03', price: 18, leadTime: 6, minOrder: 140},
        {componentId: 'comp-srv-025', supplierId: 'c-sup-02', price: 27, leadTime: 8, minOrder: 80},
        {componentId: 'comp-srv-030', supplierId: 'c-sup-03', price: 21, leadTime: 5, minOrder: 100},
        {componentId: 'comp-srv-031', supplierId: 'c-sup-05', price: 14, leadTime: 8, minOrder: 150},
        {componentId: 'comp-srv-040', supplierId: 'c-sup-03', price: 12, leadTime: 6, minOrder: 220},
        {componentId: 'comp-srv-041', supplierId: 'c-sup-05', price: 18, leadTime: 9, minOrder: 500},
        {componentId: 'comp-srv-042', supplierId: 'c-sup-05', price: 7, leadTime: 8, minOrder: 300},
        {componentId: 'comp-srv-045', supplierId: 'c-sup-05', price: 8, leadTime: 10, minOrder: 600},
        {componentId: 'comp-srv-046', supplierId: 'c-sup-03', price: 2, leadTime: 7, minOrder: 1000},
        {componentId: 'comp-srv-050', supplierId: 'c-sup-04', price: 25, leadTime: 12, minOrder: 100},
        {componentId: 'comp-srv-051', supplierId: 'c-sup-04', price: 33, leadTime: 12, minOrder: 120},
        {componentId: 'comp-srv-052', supplierId: 'c-sup-04', price: 19, leadTime: 11, minOrder: 100},
        {componentId: 'comp-srv-053', supplierId: 'c-sup-04', price: 22, leadTime: 10, minOrder: 130},
        {componentId: 'comp-srv-054', supplierId: 'c-sup-04', price: 17, leadTime: 11, minOrder: 110},
        {componentId: 'comp-srv-055', supplierId: 'c-sup-04', price: 30, leadTime: 10, minOrder: 80},
        {componentId: 'comp-srv-056', supplierId: 'c-sup-03', price: 13, leadTime: 6, minOrder: 200},
        {componentId: 'comp-srv-057', supplierId: 'c-sup-03', price: 11, leadTime: 5, minOrder: 180},
        {componentId: 'comp-srv-058', supplierId: 'c-sup-03', price: 9, leadTime: 5, minOrder: 240},
        {componentId: 'comp-srv-070', supplierId: 'c-sup-03', price: 4, leadTime: 5, minOrder: 300},
        {componentId: 'comp-srv-072', supplierId: 'c-sup-03', price: 8, leadTime: 6, minOrder: 220},
        {componentId: 'comp-srv-074', supplierId: 'c-sup-03', price: 1, leadTime: 4, minOrder: 800},
        {componentId: 'comp-srv-080', supplierId: 'c-sup-03', price: 5, leadTime: 4, minOrder: 500},
        {componentId: 'comp-srv-081', supplierId: 'c-sup-03', price: 6, leadTime: 4, minOrder: 400},
        {componentId: 'comp-srv-090', supplierId: 'c-sup-01', price: 7, leadTime: 4, minOrder: 300},
        {componentId: 'comp-srv-091', supplierId: 'c-sup-01', price: 3, leadTime: 4, minOrder: 320},
        {componentId: 'comp-srv-100', supplierId: 'c-sup-03', price: 94, leadTime: 7, minOrder: 40},
        {componentId: 'comp-srv-101', supplierId: 'c-sup-02', price: 71, leadTime: 8, minOrder: 60},
        {componentId: 'comp-srv-102', supplierId: 'c-sup-03', price: 47, leadTime: 6, minOrder: 70},
        {componentId: 'comp-srv-103', supplierId: 'c-sup-03', price: 16, leadTime: 5, minOrder: 150},
        {componentId: 'comp-srv-105', supplierId: 'c-sup-04', price: 45, leadTime: 10, minOrder: 80},
        {componentId: 'comp-srv-110', supplierId: 'c-sup-03', price: 6, leadTime: 4, minOrder: 260},
        {componentId: 'comp-srv-112', supplierId: 'c-sup-03', price: 2, leadTime: 4, minOrder: 500},
        {componentId: 'comp-srv-120', supplierId: 'c-sup-03', price: 14, leadTime: 5, minOrder: 120},
        {componentId: 'comp-srv-121', supplierId: 'c-sup-03', price: 14, leadTime: 5, minOrder: 120}
      ] AS supplierLink
      MATCH (component:Component {id: supplierLink.componentId})
      MATCH (supplier:Company {id: supplierLink.supplierId})
      MERGE (component)-[suppliedBy:SUPPLIED_BY]->(supplier)
      SET suppliedBy.price = supplierLink.price,
          suppliedBy.leadTime = supplierLink.leadTime,
          suppliedBy.minOrder = supplierLink.minOrder

      WITH DISTINCT 1 AS _
      UNWIND [
        {manufacturerId: 'c-man-01', productId: 'prod-01', capacity: 6000, unitCost: 300, qualityScore: 0.95},
        {manufacturerId: 'c-man-01', productId: 'prod-02', capacity: 9000, unitCost: 130, qualityScore: 0.93},
        {manufacturerId: 'c-man-01', productId: 'prod-03', capacity: 680, unitCost: 3720, qualityScore: 0.91},
        {manufacturerId: 'c-man-01', productId: 'prod-04', capacity: 2200, unitCost: 58, qualityScore: 0.94}
      ] AS manufactureSpec
      MATCH (manufacturer:Company {id: manufactureSpec.manufacturerId})
      MATCH (product:Product {id: manufactureSpec.productId})
      MERGE (manufacturer)-[manufactures:MANUFACTURES]->(product)
      SET manufactures.capacity = manufactureSpec.capacity,
          manufactures.unitCost = manufactureSpec.unitCost,
          manufactures.qualityScore = manufactureSpec.qualityScore

      WITH DISTINCT 1 AS _
      UNWIND [
        {distributorId: 'c-dist-01', productId: 'prod-01', stock: 1100, lastRestocked: '2026-02-10'},
        {distributorId: 'c-dist-01', productId: 'prod-02', stock: 2200, lastRestocked: '2026-02-14'},
        {distributorId: 'c-dist-01', productId: 'prod-03', stock: 96, lastRestocked: '2026-02-18'},
        {distributorId: 'c-dist-01', productId: 'prod-04', stock: 360, lastRestocked: '2026-02-17'},
        {distributorId: 'c-dist-02', productId: 'prod-03', stock: 64, lastRestocked: '2026-02-20'},
        {distributorId: 'c-dist-02', productId: 'prod-04', stock: 410, lastRestocked: '2026-02-21'},
        {distributorId: 'c-dist-03', productId: 'prod-03', stock: 52, lastRestocked: '2026-02-22'}
      ] AS distributionSpec
      MATCH (distributor:Company {id: distributionSpec.distributorId})
      MATCH (product:Product {id: distributionSpec.productId})
      MERGE (distributor)-[distributorOf:DISTRIBUTOR_OF]->(product)
      SET distributorOf.stock = distributionSpec.stock,
          distributorOf.lastRestocked = distributionSpec.lastRestocked

      WITH DISTINCT 1 AS _
      UNWIND [
        {productId: 'prod-01', locationId: 'loc-prg-01', quantity: 820, lastRestockDate: '2026-02-11'},
        {productId: 'prod-01', locationId: 'loc-rtm-01', quantity: 280, lastRestockDate: '2026-02-18'},
        {productId: 'prod-02', locationId: 'loc-rtm-01', quantity: 1420, lastRestockDate: '2026-02-16'},
        {productId: 'prod-03', locationId: 'loc-nyc-01', quantity: 42, lastRestockDate: '2026-02-19'},
        {productId: 'prod-03', locationId: 'loc-chi-01', quantity: 38, lastRestockDate: '2026-02-20'},
        {productId: 'prod-03', locationId: 'loc-lax-01', quantity: 26, lastRestockDate: '2026-02-22'},
        {productId: 'prod-04', locationId: 'loc-prg-01', quantity: 220, lastRestockDate: '2026-02-17'},
        {productId: 'prod-04', locationId: 'loc-chi-01', quantity: 180, lastRestockDate: '2026-02-21'}
      ] AS stockSpec
      MATCH (product:Product {id: stockSpec.productId})
      MATCH (location:Location {id: stockSpec.locationId})
      MERGE (product)-[storedAt:STORED_AT]->(location)
      SET storedAt.quantity = stockSpec.quantity,
          storedAt.lastRestockDate = stockSpec.lastRestockDate

      WITH DISTINCT 1 AS _
      UNWIND [
        {id: 'order-2026-0001', orderDate: '2026-02-01', dueDate: '2026-02-14', quantity: 120, status: 'delivered', cost: 55200},
        {id: 'order-2026-0002', orderDate: '2026-02-08', dueDate: '2026-02-22', quantity: 90, status: 'in_transit', cost: 40500},
        {id: 'order-2026-0003', orderDate: '2026-02-12', dueDate: '2026-02-25', quantity: 65, status: 'delayed', cost: 338000},
        {id: 'order-2026-0004', orderDate: '2026-02-15', dueDate: '2026-03-01', quantity: 32, status: 'pending', cost: 166400},
        {id: 'order-2026-0005', orderDate: '2026-02-18', dueDate: '2026-02-28', quantity: 180, status: 'delivered', cost: 43200}
      ] AS orderSpec
      MERGE (order:Order {id: orderSpec.id})
      SET order.orderDate = orderSpec.orderDate,
          order.dueDate = orderSpec.dueDate,
          order.quantity = orderSpec.quantity,
          order.status = orderSpec.status,
          order.cost = orderSpec.cost

      WITH DISTINCT 1 AS _
      UNWIND [
        {orderId: 'order-2026-0001', fromCompanyId: 'c-cust-01', placedWithId: 'c-man-01'},
        {orderId: 'order-2026-0002', fromCompanyId: 'c-cust-01', placedWithId: 'c-man-01'},
        {orderId: 'order-2026-0003', fromCompanyId: 'c-cust-01', placedWithId: 'c-man-01'},
        {orderId: 'order-2026-0004', fromCompanyId: 'c-cust-02', placedWithId: 'c-man-01'},
        {orderId: 'order-2026-0005', fromCompanyId: 'c-cust-02', placedWithId: 'c-man-01'}
      ] AS orderCompanySpec
      MATCH (order:Order {id: orderCompanySpec.orderId})
      MATCH (fromCompany:Company {id: orderCompanySpec.fromCompanyId})
      MATCH (placedWith:Company {id: orderCompanySpec.placedWithId})
      MERGE (order)-[:FROM]->(fromCompany)
      MERGE (order)-[:PLACED_WITH]->(placedWith)

      WITH DISTINCT 1 AS _
      UNWIND [
        {orderId: 'order-2026-0001', productId: 'prod-01', quantity: 120, unitPrice: 460},
        {orderId: 'order-2026-0002', productId: 'prod-02', quantity: 90, unitPrice: 225},
        {orderId: 'order-2026-0003', productId: 'prod-03', quantity: 65, unitPrice: 5200},
        {orderId: 'order-2026-0004', productId: 'prod-03', quantity: 32, unitPrice: 5200},
        {orderId: 'order-2026-0005', productId: 'prod-04', quantity: 180, unitPrice: 240}
      ] AS orderItemSpec
      MATCH (order:Order {id: orderItemSpec.orderId})
      MATCH (product:Product {id: orderItemSpec.productId})
      MERGE (order)-[contains:CONTAINS]->(product)
      SET contains.quantity = orderItemSpec.quantity,
          contains.unitPrice = orderItemSpec.unitPrice

      WITH DISTINCT 1 AS _
      UNWIND [
        {orderId: 'order-2026-0001', routeId: 'route-08', departureDate: '2026-02-03', arrivalDate: '2026-02-08'},
        {orderId: 'order-2026-0002', routeId: 'route-02', departureDate: '2026-02-10', arrivalDate: '2026-02-21'},
        {orderId: 'order-2026-0003', routeId: 'route-03', departureDate: '2026-02-14', arrivalDate: '2026-02-28'},
        {orderId: 'order-2026-0004', routeId: 'route-04', departureDate: '2026-02-16', arrivalDate: '2026-03-02'},
        {orderId: 'order-2026-0005', routeId: 'route-05', departureDate: '2026-02-19', arrivalDate: '2026-02-27'}
      ] AS shipmentSpec
      MATCH (order:Order {id: shipmentSpec.orderId})
      MATCH (route:Route {id: shipmentSpec.routeId})
      MERGE (order)-[shippedVia:SHIPPED_VIA]->(route)
      SET shippedVia.departureDate = shipmentSpec.departureDate,
          shippedVia.arrivalDate = shipmentSpec.arrivalDate
    `);
  }

  private ensureRecord<T>(value: T | undefined, message: string): T {
    if (!value) {
      throw new BadRequestException(message);
    }

    return value;
  }

  private normalizeProductInput(
    input: JsonRecord,
    allowPartial = false,
  ): ProductRecord {
    const id = this.buildEntityId('prod', input.id);

    return {
      id,
      name:
        allowPartial && input.name === undefined
          ? ''
          : (this.optionalString(input.name) ?? 'Unnamed Product'),
      sku:
        allowPartial && input.sku === undefined
          ? ''
          : (this.optionalString(input.sku) ?? `SKU-${id.toUpperCase()}`),
      price:
        allowPartial && input.price === undefined
          ? 0
          : this.toNumber(input.price, 0),
      weight:
        allowPartial && input.weight === undefined
          ? 0
          : this.toNumber(input.weight, 0),
      leadTime:
        allowPartial && input.leadTime === undefined
          ? 14
          : this.toNumber(input.leadTime, 14),
      status: this.normalizeStatus(
        allowPartial && input.status === undefined ? 'active' : input.status,
        ['active', 'discontinued'],
      ),
    };
  }

  private normalizeCompanyInput(
    input: JsonRecord,
    allowPartial = false,
  ): CompanyRecord {
    const id = this.buildEntityId('comp', input.id);

    return {
      id,
      name:
        allowPartial && input.name === undefined
          ? ''
          : (this.optionalString(input.name) ?? 'Unnamed Company'),
      type: this.normalizeStatus(
        allowPartial && input.type === undefined ? 'supplier' : input.type,
        ['supplier', 'manufacturer', 'distributor', 'retailer', 'customer'],
      ),
      country:
        allowPartial && input.country === undefined
          ? ''
          : (this.optionalString(input.country) ?? 'Unknown'),
      coordinates:
        allowPartial && input.coordinates === undefined
          ? ''
          : this.normalizeCoordinates(input.coordinates),
      reliability: Math.max(
        0,
        Math.min(
          1,
          allowPartial && input.reliability === undefined
            ? 0
            : this.toNumber(input.reliability, 0.85),
        ),
      ),
    };
  }

  private normalizeOrderInput(input: JsonRecord): OrderRecord {
    const id = this.buildEntityId('order', input.id);

    return {
      id,
      orderDate: this.normalizeDate(input.orderDate),
      dueDate: this.normalizeDate(input.dueDate),
      quantity: this.toNumber(input.quantity, 0),
      status: this.normalizeStatus(input.status, [
        'pending',
        'in_transit',
        'delivered',
        'delayed',
      ]),
      cost: this.toNumber(input.cost, 0),
    };
  }

  private normalizeComponentInput(input: JsonRecord): ComponentRecord {
    const id = this.buildEntityId('component', input.id);

    return {
      id,
      name: this.optionalString(input.name) ?? 'Unnamed Component',
      price: this.toNumber(input.price, 0),
      quantity: this.toNumber(input.quantity, 1),
      criticality: this.normalizeStatus(input.criticality, [
        'low',
        'medium',
        'high',
      ]),
    };
  }

  private normalizeSuppliersInput(input: unknown):
    | Array<{
        companyId: string;
        price: number;
        leadTime: number;
        minOrder: number;
      }>
    | [] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((entry) => {
        const asObject = entry as JsonRecord;
        const companyId = this.optionalString(asObject.companyId);
        if (!companyId) {
          return null;
        }

        return {
          companyId,
          price: this.toNumber(asObject.price, 0),
          leadTime: this.toNumber(asObject.leadTime, 14),
          minOrder: this.toNumber(asObject.minOrder, 1),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }

  private normalizeLocationInput(
    input: JsonRecord,
    allowPartial = false,
  ): LocationRecord {
    const id = this.buildEntityId('loc', input.id);

    return {
      id,
      name:
        allowPartial && input.name === undefined
          ? ''
          : (this.optionalString(input.name) ?? 'Unnamed Hub'),
      type: this.normalizeStatus(
        allowPartial && input.type === undefined ? 'hub' : input.type,
        [
          'warehouse',
          'port',
          'distribution_center',
          'hub',
          'factory',
          'transit_node',
        ],
      ),
      coordinates:
        allowPartial && input.coordinates === undefined
          ? ''
          : this.normalizeCoordinates(input.coordinates),
      capacity:
        allowPartial && input.capacity === undefined
          ? 0
          : this.toNumber(input.capacity, 12000),
    };
  }

  private normalizeRouteInput(
    input: JsonRecord,
    allowPartial = false,
  ): RouteRecord {
    const id = this.buildEntityId('route', input.id);

    return {
      id,
      name:
        allowPartial && input.name === undefined
          ? ''
          : (this.optionalString(input.name) ?? `Route ${id.toUpperCase()}`),
      distance:
        allowPartial && input.distance === undefined
          ? 0
          : this.toNumber(input.distance, 0),
      estimatedTime:
        allowPartial && input.estimatedTime === undefined
          ? 0
          : this.toNumber(
              input.estimatedTime ?? input.time,
              0,
            ),
      cost:
        allowPartial && input.cost === undefined
          ? 0
          : this.toNumber(input.cost, 0),
      reliability: Math.max(
        0,
        Math.min(
          1,
          allowPartial && input.reliability === undefined
            ? 0
            : this.toNumber(input.reliability, 0.9),
        ),
      ),
    };
  }

  private normalizeLocationPathInput(input: unknown): string[] {
    if (!Array.isArray(input)) {
      return [];
    }

    const values = input
      .map((entry) => this.optionalString(entry))
      .filter((entry): entry is string => entry !== null);

    if (values.length <= 1) {
      return values;
    }

    const collapsed: string[] = [values[0]];
    for (const value of values.slice(1)) {
      if (value !== collapsed[collapsed.length - 1]) {
        collapsed.push(value);
      }
    }

    return collapsed;
  }

  private async assertRoutePathLocationsExist(locationIds: string[]): Promise<void> {
    const locationCountRows = await this.neo4j.run<Neo4jCountResponse>(
      `
      UNWIND $locationIds AS locationId
      MATCH (:Location {id: locationId})
      RETURN count(*) AS count
    `,
      { locationIds },
    );

    if (this.toNumber(locationCountRows[0]?.count, 0) !== locationIds.length) {
      throw new BadRequestException(
        'One or more location IDs in route path do not exist',
      );
    }
  }

  private async saveRouteWithPath(
    routePayload: RouteRecord,
    locationIds: string[],
  ): Promise<void> {
    const segmentsCount = locationIds.length - 1;
    const segmentDistance = Number(
      (routePayload.distance / Math.max(1, segmentsCount)).toFixed(2),
    );
    const segmentTime = Number(
      (routePayload.estimatedTime / Math.max(1, segmentsCount)).toFixed(2),
    );
    const segmentCost = Number(
      (routePayload.cost / Math.max(1, segmentsCount)).toFixed(2),
    );
    const segmentReliability = Number(
      Math.pow(
        Math.max(0, Math.min(1, routePayload.reliability)),
        1 / Math.max(1, segmentsCount),
      ).toFixed(3),
    );

    await this.neo4j.run(
      `
      MERGE (route:Route {id: $routeId})
      SET route += $routePayload
      WITH route
      OPTIONAL MATCH (:Location)-[existing:CONNECTED_TO {routeId: route.id}]->(:Location)
      DELETE existing
      WITH route
      UNWIND range(0, size($locationIds) - 2) AS idx
      WITH route,
           idx,
           $locationIds[idx] AS fromId,
           $locationIds[idx + 1] AS toId
      MATCH (from:Location {id: fromId})
      MATCH (to:Location {id: toId})
      MERGE (from)-[segment:CONNECTED_TO {routeId: route.id, leg: idx + 1}]->(to)
      SET segment.distance = $segmentDistance,
          segment.time = $segmentTime,
          segment.cost = $segmentCost,
          segment.reliability = $segmentReliability
    `,
      {
        routeId: routePayload.id,
        routePayload,
        locationIds,
        segmentDistance,
        segmentTime,
        segmentCost,
        segmentReliability,
      },
    );
  }

  private normalizeOrderItems(input: unknown): OrderItemInput[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((entry) => {
        const asObject = entry as JsonRecord;
        const productId = this.optionalString(asObject.productId);

        if (!productId) {
          return null;
        }

        return {
          productId,
          quantity: this.toNumber(asObject.quantity, 1),
          unitPrice: this.toNumber(asObject.unitPrice, 0),
        };
      })
      .filter((entry): entry is OrderItemInput => entry !== null);
  }

  private normalizeDate(input: unknown): string {
    const raw = this.optionalString(input);
    if (!raw) {
      return new Date().toISOString().slice(0, 10);
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }

    return parsed.toISOString().slice(0, 10);
  }

  private normalizeCoordinates(input: unknown): string {
    if (typeof input === 'string' && input.trim().length > 0) {
      return input.trim();
    }

    if (input && typeof input === 'object') {
      const obj = input as JsonRecord;
      const lat =
        this.optionalString(obj.lat) ?? this.optionalString(obj.latitude);
      const lng =
        this.optionalString(obj.lng) ?? this.optionalString(obj.longitude);
      if (lat && lng) {
        return `${lat},${lng}`;
      }
    }

    return '0,0';
  }

  private normalizeStatus(input: unknown, allowed: string[]): string {
    const value = this.optionalString(input)?.toLowerCase() ?? allowed[0];
    return allowed.includes(value) ? value : allowed[0];
  }

  private optionalString(input: unknown): string | null {
    if (typeof input !== 'string') {
      return null;
    }

    const value = input.trim();
    return value.length > 0 ? value : null;
  }

  private toNumber(input: unknown, fallback = 0): number {
    if (typeof input === 'number' && Number.isFinite(input)) {
      return input;
    }

    if (typeof input === 'string') {
      const parsed = Number(input);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }

  private buildEntityId(prefix: string, input: unknown): string {
    return (
      this.optionalString(input) ?? `${prefix}-${randomUUID().slice(0, 8)}`
    );
  }

  private async getRouteById(routeId: string): Promise<RouteRecord> {
    const rows = await this.neo4j.run<RouteRecord>(
      `
      MATCH (route:Route {id: $routeId})
      OPTIONAL MATCH (from:Location)-[segment:CONNECTED_TO {routeId: route.id}]->(to:Location)
      WITH route, from, to, segment
      ORDER BY coalesce(segment.leg, 0) ASC, from.name ASC, to.name ASC
      WITH route,
           collect(
             CASE
               WHEN segment IS NULL THEN NULL
               ELSE {
                 fromId: from.id,
                 toId: to.id,
                 leg: coalesce(segment.leg, 0)
               }
             END
           ) AS rawSegments
      WITH route, [segment IN rawSegments WHERE segment IS NOT NULL] AS segments
      RETURN route{
        .*,
        segmentsCount: size(segments),
        locationIds: CASE
          WHEN size(segments) = 0 THEN []
          ELSE [segments[0].fromId] + [segment IN segments | segment.toId]
        END
      } AS route
      LIMIT 1
    `,
      { routeId },
    );

    if (!rows[0]) {
      throw new NotFoundException(`Route ${routeId} not found`);
    }

    return rows[0];
  }

  private async ensureProductExists(productId: string): Promise<void> {
    const rows = await this.neo4j.run<Neo4jCountResponse>(
      `
      MATCH (p:Product {id: $productId})
      RETURN count(p) AS count
    `,
      { productId },
    );

    if (this.toNumber(rows[0]?.count, 0) === 0) {
      throw new NotFoundException(`Product ${productId} not found`);
    }
  }

  private async linkOrderToCompany(
    orderId: string,
    companyId: string,
    relationship: 'FROM' | 'PLACED_WITH',
  ): Promise<void> {
    const rows = await this.neo4j.run<Neo4jCountResponse>(
      `
      MATCH (o:Order {id: $orderId})
      MATCH (c:Company {id: $companyId})
      MERGE (o)-[:${relationship}]->(c)
      RETURN 1 AS count
    `,
      {
        orderId,
        companyId,
      },
    );

    if (this.toNumber(rows[0]?.count, 0) === 0) {
      throw new BadRequestException(
        `Could not link order ${orderId} to company ${companyId}`,
      );
    }
  }

  private async linkOrderToRoute(
    orderId: string,
    routeId: string,
  ): Promise<void> {
    const rows = await this.neo4j.run<Neo4jCountResponse>(
      `
      MATCH (o:Order {id: $orderId})
      MATCH (r:Route {id: $routeId})
      MERGE (o)-[rel:SHIPPED_VIA]->(r)
      ON CREATE SET rel.departureDate = $departureDate,
                    rel.arrivalDate = $arrivalDate
      RETURN 1 AS count
    `,
      {
        orderId,
        routeId,
        departureDate: new Date().toISOString().slice(0, 10),
        arrivalDate: this.addDays(7),
      },
    );

    if (this.toNumber(rows[0]?.count, 0) === 0) {
      throw new BadRequestException(
        `Could not link order ${orderId} to route ${routeId}`,
      );
    }
  }

  private buildPriceHistory(
    price: number,
  ): Array<{ date: string; price: number }> {
    const safePrice = Math.max(0, price);

    return [
      {
        date: this.addDays(-60),
        price: Number((safePrice * 0.95).toFixed(2)),
      },
      {
        date: this.addDays(-30),
        price: Number((safePrice * 1.01).toFixed(2)),
      },
      {
        date: this.addDays(0),
        price: Number((safePrice * 1.04).toFixed(2)),
      },
    ];
  }

  private addDays(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private countryRiskFactor(countryInput: unknown): number {
    const country = this.optionalString(countryInput)?.toLowerCase() ?? '';

    if (country.includes('ukraine') || country.includes('russia')) {
      return 0.85;
    }

    if (country.includes('taiwan') || country.includes('china')) {
      return 0.62;
    }

    if (country.includes('united states') || country.includes('germany')) {
      return 0.34;
    }

    return 0.45;
  }

  private generateSupplierRecommendations(input: {
    riskScore: number;
    onTimeDeliveryRate: number;
    reliabilityScore: number;
    alternatives: number;
    geopoliticalRisk: number;
  }): string[] {
    const recommendations: string[] = [];

    if (input.riskScore >= 0.65) {
      recommendations.push(
        'Increase safety stock by at least 20% for impacted components.',
      );
    }

    if (input.alternatives < 1.5) {
      recommendations.push(
        'Qualify at least one additional backup supplier this quarter.',
      );
    }

    if (input.onTimeDeliveryRate < 0.9) {
      recommendations.push(
        'Tighten delivery SLAs and introduce weekly milestone tracking.',
      );
    }

    if (input.geopoliticalRisk > 0.6) {
      recommendations.push(
        'Diversify sourcing regions to lower geopolitical concentration risk.',
      );
    }

    if (input.reliabilityScore < 0.88) {
      recommendations.push(
        'Run supplier quality audit and corrective action plan.',
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Supplier risk is moderate; continue with monthly monitoring.',
      );
    }

    return recommendations;
  }

  private parseHorizonMonths(input: string): number {
    const normalized = input.trim();

    if (normalized.length === 0) {
      return 6;
    }

    if (normalized.includes('months=')) {
      const parsed = Number(normalized.split('months=')[1]);
      return Number.isFinite(parsed) ? Math.max(1, Math.min(24, parsed)) : 6;
    }

    const direct = Number(normalized);
    if (!Number.isFinite(direct)) {
      return 6;
    }

    return Math.max(1, Math.min(24, direct));
  }

  private async countNodes(): Promise<number> {
    const rows = await this.neo4j.run<Neo4jCountResponse>(
      `
      MATCH (n)
      RETURN count(n) AS count
    `,
    );

    return this.toNumber(rows[0]?.count, 0);
  }
}
