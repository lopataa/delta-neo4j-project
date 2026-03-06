import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

type Neo4jError = {
  code: string;
  message: string;
};

type Neo4jResultData = {
  row: unknown[];
};

type Neo4jResult = {
  columns: string[];
  data: Neo4jResultData[];
};

type Neo4jHttpResponse = {
  errors: Neo4jError[];
  results: Neo4jResult[];
};

@Injectable()
export class Neo4jHttpService {
  private readonly logger = new Logger(Neo4jHttpService.name);

  async run<T = Record<string, unknown>>(
    statement: string,
    parameters: Record<string, unknown> = {},
  ): Promise<T[]> {
    const endpoint = `${this.neo4jHttpUrl}/db/${this.database}/tx/commit`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${this.encodedAuth}`,
      },
      body: JSON.stringify({
        statements: [
          {
            statement,
            parameters,
            resultDataContents: ['row'],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new InternalServerErrorException(
        `Neo4j HTTP error (${response.status})`,
      );
    }

    const payload = (await response.json()) as Neo4jHttpResponse;

    if (payload.errors.length > 0) {
      const [error] = payload.errors;
      this.logger.error(
        `Neo4j query failed: ${error.code} ${error.message}`,
        statement,
      );
      throw new InternalServerErrorException(error.message);
    }

    const result = payload.results[0];
    if (!result) {
      return [];
    }

    return result.data.map(({ row }) => this.mapRow<T>(row, result.columns));
  }

  get neo4jHttpUrl(): string {
    return process.env.NEO4J_HTTP_URL ?? 'http://localhost:7474';
  }

  get database(): string {
    return process.env.NEO4J_DATABASE ?? 'neo4j';
  }

  get neo4jUser(): string {
    return process.env.NEO4J_USER ?? 'neo4j';
  }

  get neo4jPassword(): string {
    return process.env.NEO4J_PASSWORD ?? 'password';
  }

  get encodedAuth(): string {
    return Buffer.from(`${this.neo4jUser}:${this.neo4jPassword}`).toString(
      'base64',
    );
  }

  private mapRow<T>(row: unknown[], columns: string[]): T {
    if (
      row.length === 1 &&
      typeof row[0] === 'object' &&
      row[0] !== null &&
      !Array.isArray(row[0])
    ) {
      return this.normalizeValue(row[0]) as T;
    }

    const mapped: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      mapped[column] = this.normalizeValue(row[index]);
    });

    return mapped as T;
  }

  private normalizeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.normalizeValue(entry));
    }

    if (value !== null && typeof value === 'object') {
      const asObject = value as Record<string, unknown>;

      if (
        this.looksLikeNeo4jInteger(asObject) &&
        typeof asObject.low === 'number' &&
        typeof asObject.high === 'number'
      ) {
        return asObject.low + asObject.high * 2 ** 32;
      }

      const normalizedObject: Record<string, unknown> = {};
      Object.entries(asObject).forEach(([key, nestedValue]) => {
        normalizedObject[key] = this.normalizeValue(nestedValue);
      });

      return normalizedObject;
    }

    return value;
  }

  private looksLikeNeo4jInteger(value: Record<string, unknown>): boolean {
    const keys = Object.keys(value);
    return keys.length === 2 && keys.includes('low') && keys.includes('high');
  }
}
