# Azure Pricing MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides access to the [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices). Query, compare, and analyze Azure pricing data directly from GitHub Copilot, VS Code, and other MCP-compatible clients — no API key required.

## Tools

| Tool | Description |
|------|-------------|
| `query_azure_prices` | Query Azure retail prices with filters for service, region, SKU, price type, currency, and more. Supports custom OData filter expressions for advanced queries. |
| `compare_vm_prices` | Compare Virtual Machine prices across regions or between SKU sizes for cost optimization. |
| `get_service_families` | List all available Azure service families (Compute, Storage, Databases, Networking, etc.). |
| `get_reservation_prices` | Get 1-year and 3-year reserved instance pricing for any service or SKU. |

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later

### Install & Build

```bash
git clone https://github.com/kyjones03/AzurePriceMCP.git
cd AzurePriceMCP
npm install
npm run build
```

## Integration with GitHub Copilot

### VS Code

Add the following to your VS Code `settings.json` (user or workspace) or `.vscode/mcp.json`:

```json
{
  "mcp": {
    "servers": {
      "azure-pricing": {
        "type": "stdio",
        "command": "node",
        "args": ["/absolute/path/to/AzurePriceMCP/dist/index.js"]
      }
    }
  }
}
```

> **Tip:** Replace `/absolute/path/to/AzurePriceMCP` with the actual path where you cloned the repository.

Once configured, the Azure Pricing tools will be available to GitHub Copilot in agent mode. You can invoke them by asking Copilot questions like:

- *"What's the price of a Standard_D2s_v3 VM in East US?"*
- *"Compare VM prices between eastus and westeurope."*
- *"Show me reservation pricing for SQL Database in eastus."*
- *"What Azure service families are available?"*

## Example Queries

### Query prices for a specific VM SKU

> "How much does a Standard_D4s_v5 cost per hour in westus2?"

### Compare regions

> "Compare the price of Standard_E8s_v5 VMs across eastus, westeurope, and southeastasia."

### Reservation savings

> "Show me 1-year and 3-year reservation prices for Standard_D2s_v3 in eastus."

### Filter by service family

> "List storage prices in eastus under $0.05 per GB."

## License

[MIT](LICENSE)
