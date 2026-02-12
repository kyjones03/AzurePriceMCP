#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE_URL = "https://prices.azure.com/api/retail/prices";
const API_VERSION = "2023-01-01-preview";

interface PriceItem {
  currencyCode: string;
  tierMinimumUnits: number;
  retailPrice: number;
  unitPrice: number;
  armRegionName: string;
  location: string;
  effectiveStartDate: string;
  meterId: string;
  meterName: string;
  productId: string;
  skuId: string;
  productName: string;
  skuName: string;
  serviceName: string;
  serviceId: string;
  serviceFamily: string;
  unitOfMeasure: string;
  type: string;
  isPrimaryMeterRegion: boolean;
  armSkuName: string;
  reservationTerm?: string;
  savingsPlan?: Array<{ unitPrice: number; retailPrice: number; term: string }>;
}

interface ApiResponse {
  BillingCurrency: string;
  CustomerEntityId: string;
  CustomerEntityType: string;
  Items: PriceItem[];
  NextPageLink: string | null;
  Count: number;
}

// Available tools
const tools: Tool[] = [
  {
    name: "query_azure_prices",
    description:
      "Query Azure retail prices with optional filters. Supports filtering by service name, region, SKU, price type, and more. Returns pricing information including retail price, unit of measure, and meter details.",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: {
          type: "string",
          description:
            "Filter by service name (e.g., 'Virtual Machines', 'Storage', 'SQL Database'). Case-sensitive.",
        },
        serviceFamily: {
          type: "string",
          description:
            "Filter by service family (e.g., 'Compute', 'Storage', 'Databases', 'Networking').",
        },
        armRegionName: {
          type: "string",
          description:
            "Filter by Azure region (e.g., 'eastus', 'westeurope', 'southcentralus').",
        },
        armSkuName: {
          type: "string",
          description:
            "Filter by ARM SKU name (e.g., 'Standard_D2s_v3', 'Standard_E64_v4').",
        },
        priceType: {
          type: "string",
          enum: ["Consumption", "Reservation", "DevTestConsumption"],
          description: "Filter by price type.",
        },
        currencyCode: {
          type: "string",
          description: "Currency for prices (default: USD). Examples: EUR, GBP, JPY.",
        },
        productName: {
          type: "string",
          description: "Filter by product name (e.g., 'Virtual Machines Dv3 Series').",
        },
        skuName: {
          type: "string",
          description: "Filter by SKU name.",
        },
        meterName: {
          type: "string",
          description: "Filter by meter name.",
        },
        customFilter: {
          type: "string",
          description:
            "Custom OData filter expression. Use for advanced queries (e.g., \"contains(meterName, 'Spot')\").",
        },
        primaryOnly: {
          type: "boolean",
          description: "If true, only return primary meter prices.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: 100, max: 1000).",
        },
      },
    },
  },
  {
    name: "compare_vm_prices",
    description:
      "Compare prices for Virtual Machine SKUs across regions or between different SKU sizes. Useful for cost optimization.",
    inputSchema: {
      type: "object",
      properties: {
        skuName: {
          type: "string",
          description:
            "VM SKU name to compare (e.g., 'Standard_D2s_v3'). If not provided, compares common SKUs.",
        },
        regions: {
          type: "array",
          items: { type: "string" },
          description:
            "List of regions to compare (e.g., ['eastus', 'westeurope']). If not provided, shows all regions.",
        },
        priceType: {
          type: "string",
          enum: ["Consumption", "Reservation"],
          description: "Type of pricing to compare (default: Consumption).",
        },
        currencyCode: {
          type: "string",
          description: "Currency for prices (default: USD).",
        },
      },
    },
  },
  {
    name: "get_service_families",
    description:
      "Get the list of available Azure service families that can be used for filtering prices.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_reservation_prices",
    description:
      "Get reservation (reserved instance) prices for a specific service or SKU. Shows 1-year and 3-year reservation pricing.",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: {
          type: "string",
          description: "Service name (e.g., 'Virtual Machines', 'SQL Database').",
        },
        armSkuName: {
          type: "string",
          description: "ARM SKU name (e.g., 'Standard_D2s_v3').",
        },
        armRegionName: {
          type: "string",
          description: "Azure region (e.g., 'eastus').",
        },
        currencyCode: {
          type: "string",
          description: "Currency for prices (default: USD).",
        },
      },
    },
  },
  {
    name: "get_services_by_family",
    description:
      "Get the list of available services and product types within a specific Azure service family. Useful for discovering what resources are available before querying prices.",
    inputSchema: {
      type: "object",
      properties: {
        serviceFamily: {
          type: "string",
          description:
            "The service family to explore (e.g., 'Compute', 'Storage', 'Databases').",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of price records to scan (default: 500). Higher values give more complete results but take longer.",
        },
      },
      required: ["serviceFamily"],
    },
  },
];

// Build OData filter string
function buildFilter(params: Record<string, unknown>): string {
  const filters: string[] = [];

  const simpleFilters: Record<string, string> = {
    serviceName: "serviceName",
    serviceFamily: "serviceFamily",
    armRegionName: "armRegionName",
    armSkuName: "armSkuName",
    priceType: "priceType",
    productName: "productName",
    skuName: "skuName",
    meterName: "meterName",
  };

  for (const [param, field] of Object.entries(simpleFilters)) {
    if (params[param]) {
      filters.push(`${field} eq '${params[param]}'`);
    }
  }

  if (params.customFilter) {
    filters.push(params.customFilter as string);
  }

  return filters.join(" and ");
}

// Query the Azure Prices API
async function queryAzurePrices(params: Record<string, unknown>): Promise<ApiResponse> {
  const url = new URL(API_BASE_URL);
  url.searchParams.set("api-version", API_VERSION);

  if (params.currencyCode) {
    url.searchParams.set("currencyCode", `'${params.currencyCode}'`);
  }

  if (params.primaryOnly) {
    url.searchParams.set("meterRegion", "'primary'");
  }

  const filter = buildFilter(params);
  if (filter) {
    url.searchParams.set("$filter", filter);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ApiResponse;
}

// Fetch multiple pages if needed
async function fetchWithPagination(
  params: Record<string, unknown>,
  maxResults: number = 100
): Promise<PriceItem[]> {
  const items: PriceItem[] = [];
  let response = await queryAzurePrices(params);
  items.push(...response.Items);

  while (response.NextPageLink && items.length < maxResults) {
    const nextResponse = await fetch(response.NextPageLink);
    if (!nextResponse.ok) break;
    response = (await nextResponse.json()) as ApiResponse;
    items.push(...response.Items);
  }

  return items.slice(0, maxResults);
}

// Format price items for display
function formatPriceItems(items: PriceItem[]): string {
  if (items.length === 0) {
    return "No prices found matching the criteria.";
  }

  const formatted = items.map((item) => {
    let result = `**${item.productName}** - ${item.skuName}
  - Retail Price: ${item.retailPrice} ${item.currencyCode}/${item.unitOfMeasure}
  - Region: ${item.location} (${item.armRegionName})
  - Service: ${item.serviceName} (${item.serviceFamily})
  - Type: ${item.type}
  - Meter: ${item.meterName}
  - ARM SKU: ${item.armSkuName || "N/A"}`;

    if (item.reservationTerm) {
      result += `\n  - Reservation Term: ${item.reservationTerm}`;
    }

    if (item.savingsPlan && item.savingsPlan.length > 0) {
      result += `\n  - Savings Plans:`;
      for (const plan of item.savingsPlan) {
        result += `\n    - ${plan.term}: ${plan.retailPrice} ${item.currencyCode}`;
      }
    }

    return result;
  });

  return `Found ${items.length} price(s):\n\n${formatted.join("\n\n")}`;
}

// Service families list
const SERVICE_FAMILIES = [
  "Analytics",
  "Azure Arc",
  "Azure Communication Services",
  "Azure Security",
  "Azure Stack",
  "Compute",
  "Containers",
  "Data",
  "Databases",
  "Developer Tools",
  "Dynamics",
  "Gaming",
  "Integration",
  "Internet of Things",
  "Management and Governance",
  "Microsoft Syntex",
  "Mixed Reality",
  "Networking",
  "Other",
  "Power Platform",
  "Quantum Computing",
  "Security",
  "Storage",
  "Telecommunications",
  "Web",
  "Windows Virtual Desktop",
];

// Handle tool calls
async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "query_azure_prices": {
      const maxResults = Math.min((args.maxResults as number) || 100, 1000);
      const items = await fetchWithPagination(args, maxResults);
      return formatPriceItems(items);
    }

    case "compare_vm_prices": {
      const params: Record<string, unknown> = {
        serviceName: "Virtual Machines",
        priceType: args.priceType || "Consumption",
        currencyCode: args.currencyCode,
      };

      if (args.skuName) {
        params.armSkuName = args.skuName;
      }

      const items = await fetchWithPagination(params, 500);

      // Filter by regions if specified
      let filtered = items;
      if (args.regions && Array.isArray(args.regions) && args.regions.length > 0) {
        const regions = args.regions as string[];
        filtered = items.filter((item) => regions.includes(item.armRegionName));
      }

      // Group by SKU and region
      const grouped = new Map<string, PriceItem[]>();
      for (const item of filtered) {
        const key = `${item.armSkuName}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(item);
      }

      let result = `## VM Price Comparison\n\n`;
      for (const [sku, prices] of grouped) {
        result += `### ${sku}\n`;
        const sorted = prices.sort((a, b) => a.retailPrice - b.retailPrice);
        for (const p of sorted.slice(0, 10)) {
          result += `- ${p.armRegionName}: ${p.retailPrice} ${p.currencyCode}/${p.unitOfMeasure} (${p.productName})\n`;
        }
        result += "\n";
      }

      return result || "No VM prices found for the specified criteria.";
    }

    case "get_service_families": {
      return `## Azure Service Families\n\nThe following service families can be used to filter Azure prices:\n\n${SERVICE_FAMILIES.map((f) => `- ${f}`).join("\n")}`;
    }

    case "get_reservation_prices": {
      const params: Record<string, unknown> = {
        priceType: "Reservation",
        serviceName: args.serviceName,
        armSkuName: args.armSkuName,
        armRegionName: args.armRegionName,
        currencyCode: args.currencyCode,
      };

      const items = await fetchWithPagination(params, 200);

      if (items.length === 0) {
        return "No reservation prices found for the specified criteria.";
      }

      // Group by SKU and term
      const grouped = new Map<string, PriceItem[]>();
      for (const item of items) {
        const key = `${item.armSkuName || item.skuName}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(item);
      }

      let result = `## Reservation Prices\n\n`;
      for (const [sku, prices] of grouped) {
        result += `### ${sku}\n`;
        for (const p of prices) {
          result += `- ${p.reservationTerm || "N/A"}: ${p.retailPrice} ${p.currencyCode} - ${p.location} (${p.productName})\n`;
        }
        result += "\n";
      }

      return result;
    }

    case "get_services_by_family": {
      const serviceFamily = args.serviceFamily as string;
      if (!SERVICE_FAMILIES.includes(serviceFamily)) {
        return `Unknown service family: "${serviceFamily}". Use get_service_families to see valid options.`;
      }

      const maxResults = Math.min((args.maxResults as number) || 500, 2000);
      const items = await fetchWithPagination({ serviceFamily }, maxResults);

      if (items.length === 0) {
        return `No services found for service family: ${serviceFamily}`;
      }

      // Extract unique services and products
      const services = new Map<string, Set<string>>();
      for (const item of items) {
        if (!services.has(item.serviceName)) {
          services.set(item.serviceName, new Set());
        }
        services.get(item.serviceName)!.add(item.productName);
      }

      let result = `## Services in "${serviceFamily}" Family\n\n`;
      result += `Found ${services.size} service(s) from ${items.length} price records:\n\n`;

      const sortedServices = [...services.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      for (const [serviceName, products] of sortedServices) {
        result += `### ${serviceName}\n`;
        result += `Products (${products.size}):\n`;
        const sortedProducts = [...products].sort().slice(0, 20);
        for (const product of sortedProducts) {
          result += `- ${product}\n`;
        }
        if (products.size > 20) {
          result += `- ... and ${products.size - 20} more\n`;
        }
        result += "\n";
      }

      return result;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Main server setup
async function main() {
  const server = new Server(
    {
      name: "azure-pricing-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleToolCall(name, args as Record<string, unknown>);
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${errorMessage}` }],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Azure Pricing MCP server running on stdio");
}

main().catch(console.error);